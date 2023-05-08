

const fs = require("fs");
const file = fs.readFileSync("addr.txt", "utf8");
const lines = file.split("\n");

let map = {};
let lastLine = "";
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.includes(":")) {
    const [name, addr] = line.split(": ");
    map[lastLine][name] = addr;
  } else {
    map[line] = {};
    lastLine = line;
  }
}

// fs.writeFileSync("addr.json", JSON.stringify(map, null, 2));

module.exports = {map};
