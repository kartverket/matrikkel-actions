import {require, requireNotNullOrEmpty} from "../../utils/fn-utils.ts";
import {ImageDescriptorSerde, type KubernetesAppIdentificator} from "../../utils/common-types.ts";
import * as yaml from "yaml";
import { getInput, getRequiredInput } from "../../utils/utils.ts";

export async function readAppInputs() {
    const cluster = getRequiredInput('cluster');
    const resource = getRequiredInput('resource');
    const varMatrixStr = getInput('var');
    const varFile = getInput('var_files');

    const workspace = process.env['GITHUB_WORKSPACE'];

    const resources = await parseFilelist(workspace, resource);
    require(resources.length > 0, () => `Must provide at least one resource file`)

    const varFiles = await parseFilelist(workspace, varFile);

    const varMatrix: Array<Record<string, string>> = varMatrixStr
        ? varMatrixStr
            .split(/[\r\n]+/)
            .map(it => it.trim())
            .filter(Boolean)
            .map(line => {
                const vars = line.split(',')
                    .map(it => it.trim())
                    .map(it => it.split('=').map(i => i.trim()))
                return Object.fromEntries(vars)
            })
        : [{}];

    return {
        cluster,
        resources,
        varMatrix: await combineVarFilesAndMatrix(varFiles, varMatrix)
    }
}

async function parseFilelist(workspace: string | undefined, filestring: string | null): Promise<string[]> {
    const files = (filestring?.split(',') ?? [])
        .map(it => it.trim())
        .filter(Boolean)
        .map(it => workspace ? `${workspace}/${it}` : it);

    for (const filename of files) {
        const file = Bun.file(filename)
        const exists = await file.exists()
        require(exists, () => `"${filename}" was not found`);
    }

    return files;
}

async function combineVarFilesAndMatrix(
    varFiles: string[],
    varMatrix: Array<Record<string, string>>
): Promise<Array<Record<string, string>>> {
    if (varFiles.length === 0) return varMatrix;
    if (varFiles.length > 0 && varMatrix.length > 1) {
        throw new Error('Cannot specify more than one line of "VAR" in combination with "VAR_FILES"');
    }
    const varLine = varMatrix[0] ?? {};
    const varFileContents: Array<Record<string, string>> = [];
    for (const varFile of varFiles) {
        const content = await Bun.file(varFile).text();
        let vars;
        if (varFile.endsWith('.json')) {
            vars = JSON.parse(content);
        } else if (varFile.endsWith('.yaml') || varFile.endsWith('.yml')) {
            vars = yaml.parse(content);
        } else {
            throw new Error(`Unsupported format in "VAR_FILES": ${varFile}`);
        }
        varFileContents.push({ ...vars, ...varLine });
    }

    return varFileContents;
}

type Deployment = { resource: string; content: string, variables: Record<string, string>};
export async function* getDeployments(
    resources: string[],
    varMatrix: Array<Record<string, string>>
): AsyncGenerator<Deployment> {
    for (const resource of resources) {
        const file = Bun.file(resource);
        const content = await file.text()
        for (const variables of varMatrix) {
            yield { resource, content, variables }
        }
    }
}

export function interpolate(content: string, variables: Record<string, string>): string {
    return content.replace(
        /{{\s*([^{}:]+?)\s*(?::-\s*(\S+)\s*)?}}/g,
        (_, key: string, defaultValue: string | undefined) => {
            const value = variables[key] ?? defaultValue;
            if (value == null) {
                throw new Error(`Missing template variable: ${key}`);
            }
            return value;
        }
    );
}

function isApplication(manifest: any): boolean {
    return isObject(manifest) && manifest.kind === 'Application';
}

function isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value != null && !Array.isArray(value);
}

export function findAppDescriptor(yamlfile: string): KubernetesAppIdentificator {
    const content = yaml.parseAllDocuments(yamlfile)
        .map(it => it.toJSON())
        .find(isApplication);
    require(content != null, () => `Could not find Application manifest`);
    const namespace = content.metadata.namespace;
    const appname = content.metadata.name;
    const { version } = ImageDescriptorSerde.deserialize(content.spec.image);


    requireNotNullOrEmpty(namespace, () => 'Could not find namespace in yaml');
    requireNotNullOrEmpty(appname, () => 'Could not find appname in yaml');
    requireNotNullOrEmpty(version, () => 'Could not find version in yaml');

    return { namespace, appname, version }
}
