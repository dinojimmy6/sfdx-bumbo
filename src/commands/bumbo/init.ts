import { SfdxCommand } from '@salesforce/command';
import { SfdxError, SfdxProject } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { appendFile, readFile, writeFile, mkdir } from 'fs';
import { join, sep } from 'path';
import { configDirName, deploySuffix, initFile, retrieveSuffix } from '../../lib/constants';

export default class Deploy extends SfdxCommand {
    public static description = 'Initialize sfdx-bumbo for the project.';
    protected static requiresProject = true;

    public async run(): Promise<AnyJson> {
        const projPath = await SfdxProject.resolveProjectPath();
        await new Promise((resolve, reject) => {
            readFile(join(projPath, '.forceignore'), (err, data) => {
                if (err) {
                    reject('.forceignore file not found.');
                }
                let append = '';
                if (!data.toString().includes(`\*${retrieveSuffix}`)) {
                    append = `\n*${retrieveSuffix}`;
                }
                if (!data.toString().includes(`\*${deploySuffix}`)) {
                    append = `\n*${deploySuffix}`;
                }
                resolve(append);
            });
        }).then(res => {
            return new Promise((resolve, reject) => {
                if (res) {
                    appendFile(join(projPath, '.forceignore'), res, err => {
                        if (err) reject(err);
                        resolve(0);
                    });
                } else {
                    resolve(0);
                }
            });
        }).then(() => {
            return  new Promise((resolve, reject) => {
                mkdir(`${projPath}${sep}${configDirName}`, { recursive: true }, err => {
                    if (err) reject(err);
                    writeFile(`${projPath}${sep}${configDirName}${sep}${initFile}`, 'd', err => {
                        if (err) reject(err);
                        resolve(0);
                    });
                });
            });
        }).then(() => {
            this.ux.log(`sfdx-bumbo initialized for project at ${projPath} successfully.`);
        }).catch(err => {
            throw new SfdxError(err.message, 'Bumbo Init Failed', null, 1);
        });
        return {};
    }
}
