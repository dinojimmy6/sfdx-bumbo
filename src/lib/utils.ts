import { SfdxError } from '@salesforce/core';
import { exec } from 'child_process';
import { copyFile, existsSync, lstatSync, mkdir, readdirSync, readFile, unlinkSync, writeFile } from 'fs';
import { join, sep } from 'path';
import { configDirName, timestampName } from './constants';
import { getComponentBundle, getExt, getPathName } from './metadataInfo';

export function constructFilePath(projPath) {
  return join(projPath, 'force-app', 'main', 'default');
}

export function createConfigDir(projPath) {
  return new Promise((resolve, reject) => {
    mkdir(`${projPath}\\${configDirName}`, { recursive: true}, err => {
      if (err) reject(err);
      resolve(`${projPath}\\${configDirName}`);
    });
  });
}

export function generateTemp(path, metadata, suffix) {
    const promises = [];
    metadata.forEach(ele => {
      ele.names.forEach(metaName => {
        const src = getComponentBundle(path, ele.type, metaName);
        src.forEach(pathName => {
          promises.push(new Promise((resolve, reject) => {
            copyFile(pathName, pathName + suffix, err => {
              if (err && err.code !== 'ENOENT') reject(err);
              resolve(src);
            });
          }));
        });
      });
    });
    return promises;
}

export function getLastModified(conn, metadata) {
  const fileMap = {};
  const types = [];
  metadata.forEach(ele => {
    types.push({type: ele.type, folder: null});
    ele.names.forEach(metaName => {
      fileMap[`${metaName}${getExt(ele.type)}`] = -1;
    });
  });
  const listMetadata = new Promise((resolve, reject) => {
    conn.metadata.list(types, '47.0', (err, res) => {
      if (err) reject(err);
      resolve(res);
    });
  });
  return listMetadata.then(res => {
    res.forEach(ele => {
      const cleansedName = ele.fileName.split('/').pop();
      if (fileMap[cleansedName] === -1) {
        fileMap[cleansedName] = Date.parse(ele.lastModifiedDate);
      }
    });
    return fileMap;
  });
}

export function retrieveFiles(metadata, lastRetrieve, lastModified) {
  let arg = '';
  const res = {};
  metadata.forEach(ele => {
    ele.names.forEach(metaName => {
      const fullName = getPathName('', ele.type, metaName);
      res[fullName] = null;
      if (lastRetrieve[fullName] === -1 || lastRetrieve[fullName] < lastModified[metaName + getExt(ele.type)]) {
        arg += `${ele.type}:${metaName},`;
        res[fullName] = getComponentBundle('', ele.type, metaName);
      }
    });
  });
  if (arg) {
    arg = arg.slice(0, -1);
  }
  return new Promise((resolve, reject) => {
    if (arg) {
      exec('sfdx force:source:retrieve -m ' + arg, (err, stdout, stderror) => {
        if (err) reject(err);
        resolve(res);
      });
    } else {
      resolve(res);
    }
  });
}

export function execMergetool(src, dst, toolPath) {
  const action = new Promise((resolve, reject) => {
    if (!existsSync(dst)) {
      resolve(0);
      return;
    }
    exec(`\"${toolPath}\" ${src} ${dst} -o ${src} --cs "CreateBakFiles=0" --cs "ShowInfoDialogs=0" --auto`, (err, stdout, stderror) => {
      if (err) resolve(err.code);
      resolve(0);
    });
  });
  return action;
}

export function initRetrieveTimestamp(metadata) {
  const ret = {};
  metadata.forEach(ele => {
    ele.names.forEach(metaName => {
      ret[getPathName('', ele.type, metaName)] = -1;
    });
  });
  return ret;
}

export function readRetrieveTimestamp(configDirPath, res) {
  return  new Promise((resolve, reject) => {
    readFile(`${configDirPath}${sep}${timestampName}`, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') resolve(1);
        else reject(err);
        return;
      }
      const blocks = data.toString().split(',');
      blocks.forEach(block => {
        const sp = block.split(':');
        const time = Number(sp[1]);
        if (!isNaN(time)) res[sp[0]] = time;
        else reject(`File ${timestampName} is corrupted, delete the file and try again.`);
      });
      resolve(1);
    });
  });
}

export function writeRetrieveTimestamps(configDirPath, timestamps) {
  let str = '';
  Object.keys(timestamps).forEach(key => {
    str += `${key}:${timestamps[key]},`;
  });
  return  new Promise((resolve, reject) => {
    writeFile(`${configDirPath}${sep}${timestampName}`, str.slice(0, -1), err => {
      if (err) reject(err.code);
      resolve('Timestamp written.');
    });
  });
}

export function rmInDir(startPath, filter) {
  if (!existsSync(startPath)) {
      return;
  }
  const files = readdirSync(startPath);
  files.forEach(file => {
    const filename = join(startPath, file);
    const stat = lstatSync(filename);
    if (stat.isDirectory()) {
        rmInDir(filename, filter);
    } else if (filename.indexOf(filter) >= 0) {
        unlinkSync(filename);
    }
  });
}

export function checkMergetoolPath(toolPath) {
  if (!existsSync(toolPath)) {
    throw new SfdxError(`Could not find kdiff executable at ${toolPath}. 
                                                  Specify the path to kdiff in the messages directory.`, 
                                                  'Toolpath Error', null, 1);
  }
}
