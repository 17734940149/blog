import { existsSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

// Node 预先读取前端环境文件，保持本地生产启动与 Next 开发模式的配置优先级一致。
for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const server = resolve('.next/standalone/server.js');
if (!existsSync(server)) throw new Error('尚未生成生产文件，请先运行 npm run build。');

// standalone 不自动收集静态资源；启动前补齐，与 Docker 镜像的目录布局保持一致。
await cp(resolve('.next/static'), join(dirname(server), '.next/static'), { recursive: true, force: true });
if (existsSync('public')) await cp(resolve('public'), join(dirname(server), 'public'), { recursive: true, force: true });

const child = spawn(process.execPath, [server], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', HOSTNAME: process.env.HOSTNAME || '0.0.0.0' }
});

// 将终端退出信号传给真正提供服务的进程，避免留下占用端口的子进程。
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('error', error => { console.error('前端服务启动失败：', error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
