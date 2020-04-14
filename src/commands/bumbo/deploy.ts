import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, SfdxProject } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { exec } from 'child_process';
import { copyFile } from 'fs';
import { getFiles } from '../../lib/argparse';
import { deploySuffix } from '../../lib/constants';
import { getPathName } from '../../lib/metadataInfo';
import { checkMergetoolPath, constructFilePath, createConfigDir, execMergetool, generateTemp, getLastModified,
         initRetrieveTimestamp, readRetrieveTimestamp, retrieveFiles, rmInDir,
         writeRetrieveTimestamps } from '../../lib/utils';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('dino-enhancements', 'messages');
const toolPath = messages.getMessage('mergetoolPath');

export default class Deploy extends SfdxCommand {
  public static description = 'bumbo-deploy';

  protected static flagsConfig = {
    arg: flags.string({char: 'f', description: 'Metadata string', multiple: true})
  };

  protected static requiresUsername = true;
  protected static requiresProject = true;

  public async run(): Promise<AnyJson> {
    checkMergetoolPath(toolPath);
    const metadata = getFiles(this.flags.arg);
    const conn = this.org.getConnection();
    const lastModified = await getLastModified(conn, metadata);
    const projPath = await SfdxProject.resolveProjectPath();
    rmInDir(projPath, deploySuffix);
    const configDirPath = await createConfigDir(projPath);
    const lastRetrieve = initRetrieveTimestamp(metadata);
    readRetrieveTimestamp(configDirPath, lastRetrieve).then(() => {}, err => {
      this.ux.log(err);
    });
    const path = await constructFilePath(projPath);
    await Promise.all(generateTemp(path, metadata, deploySuffix));
    const writeTimestamps = Object.assign({}, lastRetrieve);
    const deploy = {};
    await retrieveFiles(metadata, lastRetrieve, lastModified).then(retrieveStatus => {
      const promises = [];
      const now = Date.now();
      Object.keys(retrieveStatus).forEach(key => {
        if (retrieveStatus[key]) {
          retrieveStatus[key].forEach(component => {
            promises.push(execMergetool(path + component, path + component + deploySuffix, toolPath).then(res => {
              if (res === 0) {
                writeTimestamps[key] = now;
                deploy[key] = 1;
                return Promise.resolve(1);
              } else {
                this.ux.log(`Merge on file ${key} not accepted.`);
                deploy[key] = 0;
                return new Promise((resolve, reject) => {
                  copyFile(path + component + deploySuffix, path + component, err => {
                    if (err) reject(err);
                    resolve(0);
                  });
                });
              }
            }));
          });
        } else {
          deploy[key] = 1;
        }
      });
      return Promise.all(promises);
    }).then(res => {
      return this.deploy(metadata, deploy);
    }).then(res => {
      Object.keys(deploy).forEach(key => {
        deploy[key] = Date.now();
      });
      return writeRetrieveTimestamps(configDirPath, deploy);
    }).catch(err => {
      throw new SfdxError(err.message, 'bumbo-Deploy Failed', null, 1);
    }).finally(() => {
      rmInDir(projPath, deploySuffix);
    });
    return {};
  }

  private deploy(metadata, deploy) {
    let arg = '';
    metadata.forEach(ele => {
      ele.names.forEach(metaName => {
        const fullName = getPathName('', ele.type, metaName);
        if (deploy[fullName]) {
          arg += `${ele.type}:${metaName},`;
        }
      });
    });
    if (arg) {
      arg = arg.slice(0, -1);
    }
    return new Promise((resolve, reject) => {
      if (arg) {
        exec('sfdx force:source:deploy -m ' + arg, (err, stdout, stderror) => {
          if (err) reject(err);
          resolve(1);
        });
      }
    });
  }
}
