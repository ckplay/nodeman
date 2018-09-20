var mod_path="/usr/lib/node_modules/";
var pm2 = require(mod_path+'pm2');
var uds=require(mod_path+'underscore');
var events = require('events');
var fs = require('fs');
var path = require('path');
var app = require('http').createServer(handler);
var io = require(mod_path+'socket.io')(app);
var Tail=require(mod_path+'always-tail');

function handler (req, res) {
    console.log("on")
    res.writeHead(200);
    res.end();
}

var config={
    "njdir":"/data/",
    "init":"main.js",
    "hide":"nodeman,_libs",
    'logDir': '/log/',
}

var pm2_ext=function(o_pm2){
    var ref=this
    var opm2=o_pm2;
    this.disp=new events.EventEmitter();
    this.running={}
    this.runable={}
    this.logs={}
    this.log_listeners={}
    this.time=null
    this.opt=function(op,rf){
        connect(function(){
            ref[op](rf)
            //opm2.disconnect();
        })
    }
    var connect=function(rf){
        opm2.connect(function() {
            return rf()
        });
    }
    this.list=function(rf){
        opm2.list(function(err,list){
            if(err){
                console.log(" list error!!!"+err);
            }
            var o=uds.clone(ref["running"]);
            ref["running"]={}
            for(var i=0;i< list.length;i++){

                if(list[i].name.indexOf(config.hide)!=-1){
                    continue;
                }
                if(list[i].name=="nodeman"){
                    //console.log(list[i])
                    continue
                }
                //fuckme(list[i]["pid"],list[i].name)
                var inf={}
                inf["status"]=list[i].pm2_env["status"]
                inf["pid"]=list[i]["pid"]
                inf["port"]=app_port_map[list[i].name];
                inf["monit"]=list[i].monit
                inf["log_path"]=list[i]["pm2_env"]["pm_out_log_path"]
                inf["err_path"]=list[i]["pm2_env"]["pm_err_log_path"]

                ref.log_mon(list[i].name,"err",list[i]["pm2_env"]["pm_err_log_path"])
                ref.log_mon(list[i].name,"log",list[i]["pm2_env"]["pm_out_log_path"])
                ref["running"][list[i].name]=inf
            }
            if(!uds.isEqual(o,ref["running"])){
                ref.disp.emit(pm2_ext.evt_listu)
            }
            if(rf){
                return rf(ref["running"])
            }
            return false
        })
    }
    this.start=function(app){
        this.list(function(){
            if(ref.running[app]){
                console.log(app+" app start error!!!app already running")
                return false
            }
            // if (!fs.existsSync(process.env.HOME+"/"+app+"/")){
            //     fs.mkdirSync(process.env.HOME+"/"+app+"/");
            // }
            // if (!fs.existsSync(process.env.HOME+"/"+app+"/logs/")){
            //     fs.mkdirSync(process.env.HOME+"/"+app+"/logs/");
            // }

            var logDir = config.logDir;
            if (!fs.existsSync(logDir)){
                fs.mkdirSync(logDir);
            }
            logDir += 'pm2/';
            if (!fs.existsSync(logDir)){
                fs.mkdirSync(logDir);
            }
            logDir += app + '/';
            if (!fs.existsSync(logDir)){
                fs.mkdirSync(logDir);
            }
            opm2.start({
                "name":app,
                "cwd":config.njdir+"/"+app+"/",
                "script":config.init,
                //"error_file":process.env.HOME+"/"+app+"/logs/err.log",
                //"out_file":process.env.HOME+"/"+app+"/logs/app.log",
                'error_file': logDir + 'err.log',
                'out_file': logDir + 'app.log',
                "log_date_format":"YYYY-MM-DD HH:mm:ss Z",
            },function(err,apps){
                console.log(apps)
                if (err) console.log(app+" start error!!!"+err.toString());
                console.log(app+" app start sucess!!!")
                opm2.describe(app,function(a,b){})
                ref.opt("list",function(){
                    ref.opt("list_runable",null);
                });
            })
        })
    }
    this.log_mon=function(app,type,path){
        if(ref["logs"][app+"_"+type]){return;}
        var str_file_name=path
        ref["logs"][app+"_"+type] = new Tail(str_file_name, '\n');
        ref["logs"][app+"_"+type].on("line",function(data){
            if(ref.log_listeners[app]){
                for(var a in ref.log_listeners[app]){
                    var send={}
                        send["code"]="100";
                        send["app"]=app
                        send["log"]=data
                        if(ref.log_listeners[app][a].socket)
                        ref.log_listeners[app][a].socket.emit("log",send)
                }
            }
            //console.log("evt_log_"+app+"_"+type,data)
            //ref.disp.emit("evt_log_"+app+"_"+type,data)
        })
        console.log(app,type,path)
    }
    this.stop=function(app,rf){
         if(!ref.running[app]){
                console.log(app+" app stop error!!!app not running")
                return false
            }
            opm2.delete(app,function(err,proc){
                if (err) console.log(app+" delete error!!!"+err);
                delete ref.log_listeners[app]
                delete ref["logs"][app+"_"+"err"]
                delete ref["logs"][app+"_"+"log"]
                ref.opt("list",function(){

                    ref.opt("list_runable",null);
                });
                if(rf){
                    return rf()
                }

            })


    }
    this.list_runable=function(rf){
        var rcb=function(err, list){
            var o=uds.clone(ref["runable"]);
            ref.runable={}
            for(var i=0;i< list.length;i++){
                if(list[i].charAt(0)=="_"){
                    continue
                }
                if(!ref.running[list[i]]){
                    ref.runable[list[i]]="ablestart"
                }
            }
            if(!uds.isEqual(o,ref["runable"])){
                ref.disp.emit(pm2_ext.evt_listru)
            }

            if(rf){
                return rf(ref.runable)
            }
        }
        fs.readdir(config.njdir,rcb)
    }
    this.ready=function(){
        console.log("all set good to go")
    }
    this.opt("list",
        function(){
            ref.list_runable(
                function(){
                    ref.time=setInterval(function(){
                        ref.list(function(){
                            ref.list_runable()
                        })
                    },10000)
                    ref.disp.emit(pm2_ext.evt_rdy)
                }
            )
        }
    )

    return this
}
pm2_ext.evt_con="pm2_connect";
pm2_ext.evt_rdy="pm2_ready";
pm2_ext.evt_listu="pm2_list_update";
pm2_ext.evt_listru="pm2_list_runable_update";

var pm=new pm2_ext(pm2)
pm.disp.on(pm2_ext.evt_rdy,function(){
    console.log("all hail!nodeman is on now")
    process.env.HOME = config.njdir;
    app.listen(60001);
})

io.on('connection', function (socket) {
    socket.onchk=setTimeout(function(){
        if(socket.login==false&&io.sockets.connected[socket.id]){
            io.sockets.connected[socket.id].disconnect();
        }
    },1000)
    socket.emit('init',{});
    socket.login=false
    socket.uuid=new Date().getTime()
    socket.on('disconnect',function(){
        for(var a in pm.log_listeners){
            delete pm.log_listeners[a][socket.uuid]
        }
    })
    socket.on('app_start',function(data){
        pm.start(data["app"])
    })
    socket.on('app_stop',function(data){
        pm.stop(data["app"])
    })
    socket.on('login', function (data) {
        if(data.acc=="cck"&&data.pwd=="cck"){
            socket.login=true
            var send={"code":"100"}
                    send.list_run=pm.running
                    send.list_app=pm.runable
                socket.emit('login',send);
                pm.disp.on(pm2_ext.evt_listu,function(){
                    var send={"code":"100"}
                            send.list_run=pm.running
                    socket.emit('app_list_update',send);
                })
                pm.disp.on(pm2_ext.evt_listru,function(){
                    var send={"code":"100"}
                            send.list_app=pm.runable
                    socket.emit('app_listable_update',send);
                })
        }else{
            var send={"code":"400"}
            socket.emit('app_error',send);
            //io.sockets.connected[socket.id].disconnect();
        }
    });
    socket.on("list",function(data){
        pm.opt("list",(function(){
            console.log(pm.running)
        }))
    })
    socket.on("log",function(data){
        console.log("log request",data.app,"evt_log_"+data.app+"_log",socket.uuid)
        if(!pm.log_listeners[data.app]){
            pm.log_listeners[data.app]={}
        }
        pm.log_listeners[data.app][socket.uuid]={}
        pm.log_listeners[data.app][socket.uuid].socket=socket
        /*pm.disp.on("evt_log_"+data.app+"_log",function(msg){
            console.log("evt_log_"+data.app+"_log",msg)
                var send={}
                    send["code"]="100";
                    send["app"]=data.app
                    send["log"]=msg
            socket.emit("log",send)
            })
            pm.disp.on("evt_log_"+data.app+"_err",function(msg){
            console.log("evt_log_"+data.app+"_err",msg)
                var send={}
                    send["code"]="100";
                    send["app"]=data.app
                    send["log"]=msg
            socket.emit("log",send)
            })
            */
        /*
        var text = fs.readFileSync(pm.running[data.app]["log_path"],'utf8')
        var send={}
                send["code"]="100";
                send["app"]=data.app
                send["log"]=text
        socket.emit("log",send)
        */
    })
    socket.on("log_stop",function(data){
        console.log("log request stop",data.app,"evt_log_"+data.app+"_log")
        if(!pm.log_listeners[data.app]){
            return
        }
        delete pm.log_listeners[data.app][socket.uuid]
    })
    socket.on("err",function(data){
        var text = fs.readFileSync(pm.running[data.app]["err_path"],'utf8')
        console.log("err request",pm.running[data.app]["err_path"])
        var send={}
                send["code"]="100";
                send["app"]=data.app
                send["log"]=text
        socket.emit("err",send)
    })
});

var app_port_map={}

function fuckme(pid,app){
    var sys = require('sys')
    var exec = require('child_process').exec;
    function puts(error, stdout, stderr) {
        var str=stdout
                str=str.split(" ").join("").split("*")[1]
        app_port_map[app]=str
    }
    exec('ss -l -p -n | grep ",'+pid+',"', puts);
}
