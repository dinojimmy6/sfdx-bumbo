const mdMap = {ApexClass : {folder : 'classes', ext : '.cls'},
               ApexPage : {folder : 'pages', ext : '.page'},
               LightningComponentBundle : {folder : 'lwc', components : ['.js', '.css', '.html']},
               AuraDefinitionBundle : {folder : 'aura', components : ['.cmp', 'Container.js', 'Helper.js', '.design', '.css']}};

export function getFolder(metadata) {
    if (mdMap[metadata]) {
        return mdMap[metadata]['folder'];
    }
    throw new Error(`${metadata} is not a recognized metadata type.`);
}

export function getExt(metadata) {
    if (mdMap[metadata]) {
        return mdMap[metadata]['ext'] ? mdMap[metadata]['ext'] : '';
    }
    throw new Error(`${metadata} is not a recognized metadata type.`);
}

export function getPathName(path, type, name) {
    return `${path}${getFolder(type)}\\${name}${getExt(type)}`;
}

export function getComponentBundle(path, type, name) {
    const ret = [];
    const components = mdMap[type]['components'];
    if (components) {
        components.forEach(ele => {
            ret.push(`${getPathName(path, type, name)}\\${name}${ele}`);
        });
    } else {
        ret.push(getPathName(path, type, name));
    }
    return ret;
}
