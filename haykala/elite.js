const fs = require('fs');
const path = require('path');

let eliteNumbers = [
    '972532731932',
    '190989159415891'
];

const extractPureNumber = (jid) => String(jid || '').replace(/[@:].*/g, '');

const isElite = (number) => {
    if (!number) return false;
    return eliteNumbers.includes(extractPureNumber(number));
};

const updateEliteNumbers = () => {
    const elitePath = path.join(process.cwd(), 'haykala', 'elite.js');
    const numbersStr = eliteNumbers.map(num => `    '${num}'`).join(',\n');
    const newContent = `const fs = require('fs');\nconst path = require('path');\n\nlet eliteNumbers = [\n${numbersStr}\n];\n\nconst extractPureNumber = (jid) => String(jid || '').replace(/[@:].*/g, '');\nconst isElite = (number) => Boolean(number) && eliteNumbers.includes(extractPureNumber(number));\nconst updateEliteNumbers = ${updateEliteNumbers.toString()};\nconst addEliteNumber = ${addEliteNumber.toString()};\nconst removeEliteNumber = ${removeEliteNumber.toString()};\n\nmodule.exports = { eliteNumbers, extractPureNumber, isElite, updateEliteNumbers, addEliteNumber, removeEliteNumber };\n`;
    fs.writeFileSync(elitePath, newContent);
};

const addEliteNumber = (number) => {
    const pureNumber = extractPureNumber(number);
    if (pureNumber && !eliteNumbers.includes(pureNumber)) {
        eliteNumbers.push(pureNumber);
        updateEliteNumbers();
    }
};

const removeEliteNumber = (number) => {
    const pureNumber = extractPureNumber(number);
    const index = eliteNumbers.indexOf(pureNumber);
    if (index > -1) {
        eliteNumbers.splice(index, 1);
        updateEliteNumbers();
    }
};

module.exports = {
    eliteNumbers,
    extractPureNumber,
    isElite,
    updateEliteNumbers,
    addEliteNumber,
    removeEliteNumber
};
