import * as core from "@actions/core";
import {Kubectl} from "./k8s.ts";

const SECOND = 1000;
const MINUTE = 60 * 1000;
const TEN_MINUTES = 10 * MINUTE;
const TEN_SECONDS = 10 * SECOND;

const appsString = core.getMultilineInput('apps', { required: true, trimWhitespace: true })
const timeoutStr = core.getInput('timeoutMs', {required: false});
const checkIntervalStr = core.getInput('intervalMs', {required: false});
const timeoutMs = timeoutStr === '' ? TEN_MINUTES : Number(timeoutStr);
const checkIntervalMs = checkIntervalStr === '' ? TEN_SECONDS : Number(checkIntervalStr);


core.info(`Got apps: ${appsString.join(", ")}`);
core.info(`Got timeout: ${timeoutMs}`);
core.info(`Got checkinterval: ${checkIntervalMs}`);

const kubectl = new Kubectl('matrikkel-main')

const allPods = await kubectl.listPods();
const statusPods = await kubectl.listPods(`application.skiperator.no/app-name in (matrikkelstatus)`);

console.log(`Found ${allPods.items.length} in namespace`);
console.log(`Found ${statusPods.items.length} in namespace matching matrikkelstatus label`);