module.exports = {
    apps: [{
        name: "server1",
        script: "dist/index.js",
        instances: 1,
        exec_mode: "fork",
        max_memory_restart: "900M",
        kill_timeout: 5000,
        listen_timeout: 5000,
        error_file: "/var/log/pm2-error.log",
        out_file: "/var/log/pm2-out.log",
        merge_logs: true,
    }]
};
