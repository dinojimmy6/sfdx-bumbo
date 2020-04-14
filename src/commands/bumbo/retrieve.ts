import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, SfdxProject } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { copyFile } from 'fs';
import { getFiles } from '../../lib/argparse';
import { retrieveSuffix } from '../../lib/constants';
import { checkMergetoolPath, constructFilePath, createConfigDir, execMergetool, generateTemp, getLastModified,
         initRetrieveTimestamp, readRetrieveTimestamp, retrieveFiles, rmInDir,
         writeRetrieveTimestamps } from '../../lib/utils';

Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('dino-enhancements', 'messages');
const toolPath = messages.getMessage('mergetoolPath');

export default class Retrieve extends SfdxCommand {
  public static description = 'bumbo-retrieve';

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
    this.ux.log(projPath);
    rmInDir(projPath, retrieveSuffix);
    const configDirPath = await createConfigDir(projPath);
    const lastRetrieve = initRetrieveTimestamp(metadata);
    readRetrieveTimestamp(configDirPath, lastRetrieve).then(() => {}, err => {
      this.ux.log(err);
    });
    const path = await constructFilePath(projPath);
    await Promise.all(generateTemp(path, metadata, retrieveSuffix));
    const writeTimestamps = Object.assign({}, lastRetrieve);
    await retrieveFiles(metadata, lastRetrieve, lastModified).then(retrieveStatus => {
      const promises = [];
      const now = Date.now();
      Object.keys(retrieveStatus).forEach(key => {
        if (retrieveStatus[key]) {
          retrieveStatus[key].forEach(component => {
            promises.push(execMergetool(path + component, path + component + retrieveSuffix, toolPath).then(res => {
              if (res === 0) {
                writeTimestamps[key] = now;
                return Promise.resolve(1);
              } else {
                this.ux.log(`Merge on file ${key} not accepted.`);
                return new Promise((resolve, reject) => {
                  resolve(0);
                  copyFile(path + component + retrieveSuffix, path + component, err => {
                    if (err) reject(err);
                    resolve(0);
                  });
                });
              }
            }));
          });
        }
      });
      return Promise.all(promises);
    }).then(res => {
      return writeRetrieveTimestamps(configDirPath, writeTimestamps);
    }).catch(err => {
      throw new SfdxError(err.message, 'bumbo-Retrieve Failed', null, 1);
    }).finally(() => {
      rmInDir(projPath, retrieveSuffix);
    });
    return {};
  }
}
