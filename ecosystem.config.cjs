module.exports = {
    apps: [
        {
            name: "server-testing",
            script: "./dist/index.js",
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "500M",
            env: {
                NODE_ENV: "production",
                PORT: 3000
            },
            error_file: "./logs/pm2-error.log",
            out_file: "./logs/pm2-out.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss",
            // If CPU is 100% and it hangs, PM2 might not detect it unless we use a custom script or health check.
            // But PM2 usually restarts if the process crashes or becomes unresponsive.
        },
    ],
};
