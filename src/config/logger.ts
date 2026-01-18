import fs from 'fs';
import path from 'path';
import {env} from './env.js';

const LOG_DIR=env.LOG_PATH
	? path.dirname(env.LOG_PATH)
	:path.join(process.cwd(),'logs');
const LOG_FILE=env.LOG_PATH||path.join(LOG_DIR,'app.log');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR,{recursive: true});

const fileStream=fs.createWriteStream(LOG_FILE,{flags: 'a'});

type LogLevel='debug'|'info'|'warn'|'error';

const LOG_LEVELS: Record<LogLevel,number>={
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

const currentLevel=LOG_LEVELS[env.LOG_LEVEL as LogLevel]||LOG_LEVELS.info;

function formatMessage(level: string,msg: string,data?: Record<string,unknown>): string {
	const timestamp=new Date().toISOString();
	const dataStr=data? ` ${JSON.stringify(data)}`:'';
	return `[${timestamp}] ${level.toUpperCase()}: ${msg}${dataStr}`;
}

function log(level: LogLevel,first: unknown,second?: string) {
	if (LOG_LEVELS[level]<currentLevel) return;

	let msg: string;
	let data: Record<string,unknown>|undefined;

	if (typeof first==='string') {
		msg=first;
	} else if (typeof first==='object'&&first!==null) {
		data=first as Record<string,unknown>;
		msg=second??'';
	} else {
		msg=String(first);
	}

	const formatted=formatMessage(level,msg,data);
	fileStream.write(formatted+'\n');

	if (env.TRANSPORT==='stdio') {
		process.stderr.write(formatted+'\n');
	} else {
		console.log(formatted);
	}
}

export const logger={
	debug: (first: unknown,second?: string) => log('debug',first,second),
	info: (first: unknown,second?: string) => log('info',first,second),
	warn: (first: unknown,second?: string) => log('warn',first,second),
	error: (first: unknown,second?: string) => log('error',first,second),
};

logger.info(`Logging to file: ${LOG_FILE}`);
