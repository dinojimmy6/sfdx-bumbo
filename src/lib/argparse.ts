export function getFiles(arg) {
    const ret = [];
    arg.forEach(match => {
        const sp = match.split(':');
        ret.push({type: sp[0], names: sp[1].split(',')});
    });
    return ret;
}
