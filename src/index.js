const { join } = require("path");
const showdown = require(join(__dirname, "showdown.min.js"));
const { map } = require(join(__dirname, "addr.js"));

const fs = require("fs");
const file = fs.readFileSync(join(__dirname, "input.txt"), "utf8");
const lines = file.split("\n");
const filenames = {};
const uniq = {};

const writer = fs.createWriteStream("index.html", { flags: "w", encoding: "utf8" });
const md = new showdown.Converter({
  literalMidWordUnderscores: true,
  disableForced4SpacesIndentedSublists: true,
  noHeaderId: true,
});

writer.write(
  `<!DOCTYPE HTML>
<html>
<head>
<meta charset="utf-8">
<style>p {font-family: monospace; }</style>
</head>
<body>`
);
writeMd(generateToc());

let output = "";
let curFile = "";
let isPreOpen = false;
let skipFile = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("plugin::") && !skipFile) {
    const prevLine = lines[i - 1];
    let name = "";
    let className = "";

    if (prevLine.includes("::")) {
      const [c, m] = prevLine.split("::");
      className = c.split(" ").at(-1);
      const methodName = m?.split("(")[0];
      name = className + "::" + methodName;
    } else {
      if (!prevLine.includes("(")) {
        console.error(`Non callable at line ${line}`);
        continue;
      }
      name = prevLine.split("(")[0].split(" ").at(-1).trim();
    }
    output += `\n#### ${name}\n\n${line.substring(line.indexOf("plugin::")).trimStart()}\n`;
    isPreOpen = true;

    const type = between(line, "<", ">");
    const types = type.split(",").map((p) => p.trim());

    // 0AA5 cdecl num=pop
    // 0AA5 stdcall pop=0
    if (line.includes("plugin::Call<") || line.includes("plugin::CallStd<")) {
      const [address] = types;
      assertAddress(address);

      const params = getParams(line);
      const pop = line.includes("plugin::CallStd<") ? 0 : params.length;
      output += _0AA5({ address, params, pop });
      output += _0AA5_new({ address, params, pop, name });
    }
    // 0AA7 cdecl num=pop
    // 0AA7 stdcall pop=0
    if (line.includes("plugin::CallAndReturn<") || line.includes("plugin::CallStdAndReturn<")) {
      const [ret, address] = types;
      assertAddress(address);

      const params = getParams(line);
      const pop = line.includes("plugin::CallStdAndReturn<") ? 0 : params.length;
      output += _0AA7({ address, params, ret, pop });
      output += _0AA7_new({ address, params, ret, pop, name });
    }
    // 0AA6 thiscall pop 0
    if (line.includes("plugin::CallMethod<")) {
      const [address] = types;
      assertAddress(address);
      const params = getParams(line).slice(1); // this

      if (!className) {
        console.error(`Expected value but got null or undefined. Line: ${line}`);
        continue;
      }
      output += _0AA6({ address, className, params });
      output += _0AA6_new({ address, className, params, name });
    }
    // 0AA8 thiscall pop 0
    if (line.includes("plugin::CallMethodAndReturn<")) {
      const [ret, address] = types;
      assertAddress(address);
      const params = getParams(line).slice(1); // this
      if (!className) {
        console.error(`Expected value but got null or undefined. Line: ${line}`);
        continue;
      }
      output += _0AA8({ address, className, params, ret });
      output += _0AA8_new({ address, className, params, ret, name });
    }

    if (line.includes("plugin::CallAndReturnDynGlobal")) {
      let params = getParams(line);
      const [gaddrof] = params;
      params = params.slice(1); // address
      if (!gaddrof.startsWith("gaddrof")) {
        continue;
      }
      let address = findAddressByName(gaddrof, curFile);
      const [ret] = types;
      output += _0AA7({ address, params, ret });
      output += _0AA7_new({ address, params, ret, name });

    }

    if (line.includes("plugin::CallMethodDynGlobal")) {
      // assertDyn(line); // todo: ctor_gaddr
      let params = getParams(line);
      const [gaddrof] = params;
      params = params.slice(2); // this and address
      if (!gaddrof.startsWith("gaddrof")) {
        continue;
      }
      let address = findAddressByName(gaddrof, curFile);
      if (!className) {
        console.error(`Expected value but got null or undefined. Line: ${line}`);
        continue;
      }
      output += _0AA6({ address, className, params });
      output += _0AA6_new({ address, className, params, name });
    }

    if (line.includes("plugin::CallMethodAndReturnDynGlobal")) {
      assertDyn(line);
      let params = getParams(line);
      const [gaddrof] = params;
      params = params.slice(2); // this and address
      if (!gaddrof.startsWith("gaddrof")) {
        throw new Error(line);
      }
      let address = findAddressByName(gaddrof, curFile);
      const [ret] = types;

      if (!className) {
        console.error(`Expected value but got null or undefined. Line: ${line}`);
        continue;
      }
      output += _0AA8({ address, className, params, ret });
      output += _0AA8_new({ address, className, params, ret, name });
    }
  } else if (line.includes("plugin_")) {
    if (isPreOpen) {
      isPreOpen = false;
      writeMd(output);
      output = "";
    }
    if (filenames[i]) {
      curFile = filenames[i];
      writeMd(`\n### ${filenames[i]}`, true);
      skipFile = false;
    } else {
      skipFile = true;
      continue;
    }
  } else {
    continue;
  }

  output += "\n";
}

writer.write(`</body></html>`);
writer.end();

//------------------ functions ------------------//

function generateToc() {
  let toc = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("plugin_")) {
      let curFile = line.substring(line.indexOf("plugin_")).replace(":", "");

      const paths = curFile.split("\\");
      if (paths.length < 3) {
        throw new Error(`Invalid path ${curFile}`);
      }
      const [namespace, game] = paths;
      if (namespace === "plugin_II") {
        continue;
      }
      const file = paths.at(-1);
      toc[namespace] ??= {};
      toc[namespace][game] ??= [];
      toc[namespace][game].push(file);

      filenames[i] = curFile;
    }
  }
  let tocs = "";
  for (const n of Object.keys(toc)) {
    tocs += `* ${n}\n`;
    for (const g of Object.keys(toc[n])) {
      tocs += `  * ${g}\n`;
      for (const f of toc[n][g]) {
        let href = [n, g, f].map((x) => x.toLowerCase().replace(/\./g, ""));
        tocs += `      * [${f}](#${href.join("")})\n`;
      }
    }
  }
  return tocs;
}

function assertAddress(addr) {
  if (!addr.startsWith("0x")) {
    throw new Error(`error: address must start with 0x, got ${addr}`);
  }

  let ns = curFile.split("\\").at(0);
  uniq[ns] ??= new Set();
  if (uniq[ns].has(addr)) {
    console.log(`duplicate address ${addr} for ${ns}`);
  }
  uniq[ns].add(addr);
}

function assertDyn(s) {
  if (!s.includes("gaddrof")) {
    throw new Error(`wrong line ${s}`);
  }
}

function getParams(line) {
  // skip generics <>
  let closePos = -1;
  let angle = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "<") {
      angle++;
    } else if (c === ">") {
      angle--;
      if (angle === 0) {
        closePos = i;
        break;
      }
    }
  }
  const paramLine = between(line.substring(closePos + 1), "(", ")");

  // split paramLine by , ignoring , inside parenthesis
  let params = [];
  let cur = "";
  let paren = 0;
  for (let i = 0; i < paramLine.length; i++) {
    const c = paramLine[i];
    if (c === "(") {
      paren++;
    } else if (c === ")") {
      paren--;
    } else if (c === "," && paren === 0) {
      params.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  params.push(cur);
  assertNumParams(params);

  return params.filter(Boolean).map((x) => x.trim());
}

function assertNumParams(num) {
  if (num < 0) {
    throw new Error(`num_params < 0`);
  }
}

function between(line, startChar, endChar) {
  return line.substring(line.indexOf(startChar) + 1, line.lastIndexOf(endChar));
}

function stringifyParams(params, bracketify = true) {
  // return concat(...params.reverse().map((x) => `[${x}]`));
  return bracketify ? concat(' ', ...params.map((x) => `[${x}]`)) : concat(', ', ...params);
}

function findAddressByName(gaddrof, curFile) {
  let varName = between(gaddrof, "(", ")").split(",")[0];
  if (!map[curFile]?.[varName]) {
    throw new Error(`${varName} is not defined in ${curFile}`);
  }
  let address = map[curFile][varName];
  assertAddress(address);
  return address;
}

function _0AA5({ address, params, pop = params.length }) {
  return concat(' ' ,`\n0AA5: call_function ${address} num_params ${params.length} pop ${pop}`, stringifyParams(params));
}

function _0AA5_new({ address, params, pop = params.length, name }) {
  return `\n\ndefine function ${name2scm(name)}&lt;${params.length === pop ? "cdecl" : "stdcall"}, ${address}&gt;(${stringifyParams(params, false)})`;
}

function _0AA6({ address, className, params }) {
  return concat(' ',
    `\n0AA6: call_method ${address} struct [${className}] num_params ${params.length} pop 0`,
    stringifyParams(params)
  );
}

function _0AA6_new({ address, className, params, name }) {
  return `\n\ndefine function ${name2scm(name)}&lt;thiscall, ${address}&gt;(${stringifyParams(['struct: int', ...params], false)})`;
}

function _0AA7({ address, params, ret, pop = params.length }) {
  return concat(' ',
    `\n0AA7: call_function_return ${address} num_params ${params.length} pop ${pop}`,
    stringifyParams(params),
    `func_ret [${ret}]`
  );
}

function _0AA7_new({ address, params, ret, pop = params.length, name }) {
  return `\n\ndefine function ${name2scm(name)}&lt;${params.length === pop ? "cdecl" : "stdcall"}, ${address}&gt;(${stringifyParams(params, false)}): ${ret === 'float' ? 'float': 'int'}`;
}


function _0AA8({ address, className, params, ret }) {
  return concat(' ',
    `\n0AA8: call_method_return ${address} struct [${className}] num_params ${params.length} pop 0`,
    stringifyParams(params),
    `func_ret [${ret}]`
  );
}

function _0AA8_new({ address, className, params, ret, pop = params.length, name }) {
  return `\n\ndefine function ${name2scm(name)}&lt;thiscall, ${address}&gt;(${stringifyParams(['struct: int', ...params], false)}): ${ret === 'float' ? 'float': 'int'}`;
}

function concat(sep, ...elems) {
  return elems.filter(Boolean).join(sep);
}

function writeMd(content, withHeader = false) {
  md.setOption("noHeaderId", !withHeader);
  writer.write(md.makeHtml(content));
}

function name2scm(name) {
  return name.replace(/:/g, "_").replace(/^\*/, '');
}