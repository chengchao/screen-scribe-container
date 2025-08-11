import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { resolve } from 'path';

interface ExecuteOpts {
	// flags/short-long switches for the command itself
	flags?: string[];
	// positional arguments after the flags
	args?: string[];
	// spawnSync settings (cwd, env, etc.)
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}

export async function execute(command: string, { cwd = '/tmp', flags = [], args = [], env }: ExecuteOpts = {}) {
	const workdir = resolve(cwd);
	try {
		const stat = await fs.stat(workdir);
		if (!stat.isDirectory()) {
			throw new Error(`${workdir} exists but is not a directory`);
		}
	} catch (err: any) {
		if (err.code === 'ENOENT') {
			await fs.mkdir(workdir, { recursive: true });
		} else {
			throw err;
		}
	}

	const allArgs = flags.concat(args);
	return new Promise<string>((resolve, reject) => {
		const proc = spawn(command, allArgs, {
			cwd: workdir,
			stdio: ['inherit', 'pipe', 'pipe'],
			env,
		});

		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (data) => {
			stdout += data.toString();
		});
		proc.stderr.on('data', (data) => {
			stderr += data.toString();
			console.error(stderr);
		});
		proc.on('error', (err) => reject(new Error(`${command} failed to start: ${err.message}`)));
		proc.on('close', (code) => {
			if (code === 0) {
				resolve(stdout.trim());
			} else {
				reject(new Error(`${command} exited with code ${code}: ${stderr}`));
			}
		});
	});
}
