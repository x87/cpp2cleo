const { map } = require("./addr");

const fs = require("fs");
const file = fs.readFileSync("input.txt", "utf8");
const lines = file.split("\n");
let output = "";
let curFile = "";

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("plugin::")) {
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

    output += `\n\t// ${name}\n\t// ` + line.substring(line.indexOf("plugin::")).trimStart();

    const type = between(line, "<", ">");
    const types = type.split(",").map((p) => p.trim());

    // 0AA5 cdecl num=pop
    // 0AA5 stdcall pop=0
    if (line.includes("plugin::Call<") || line.includes("plugin::CallStd<")) {
      const [address] = types;
      assertAddress(address);

      const params = getParams(line);
      const pop = line.includes("plugin::CallStd<") ? 0 : params.length;
      output += `\n\t0AA5: call_function ${address} num_params ${params.length} pop ${pop}`;

      for (const param of params) {
        output += ` [${param}]`;
      }
    }
    // 0AA7 cdecl num=pop
    // 0AA7 stdcall pop=0
    if (line.includes("plugin::CallAndReturn<") || line.includes("plugin::CallStdAndReturn<")) {
      const [ret, address] = types;
      assertAddress(address);

      const params = getParams(line);
      const pop = line.includes("plugin::CallStdAndReturn<") ? 0 : params.length;
      output += `\n\t0AA7: call_function_return ${address} num_params ${params.length} pop ${pop}`;
      for (const param of params) {
        output += ` [${param}]`;
      }
      output += ` func_ret [${ret}]`;
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
      output += `\n\t0AA6: call_method ${address} struct [${className}] num_params ${params.length} pop 0`;
      for (const param of params) {
        output += ` [${param}]`;
      }
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
      output += `\n\t0AA8: call_method_return ${address} struct [${className}] num_params ${params.length} pop 0`;
      for (const param of params) {
        output += ` [${param}]`;
      }
      output += ` func_ret [${ret}]`;
    }

    if (line.includes("plugin::CallMethodAndReturnDynGlobal")) {
      assertDyn(line);
      let params = getParams(line);
      const [gaddrof] = params;
      params = params.slice(2); // this and address
      if (!gaddrof.startsWith("gaddrof")) {
        throw new Error(line);
      }
      let varName = between(gaddrof, "(", ")").split(",")[0];
      if (!map[curFile][varName]) {
        throw new Error(`${varName} is not defined in ${curFile}`);
      }
      let address = map[curFile][varName];
      const [ret] = types;
      assertAddress(address);
      if (!className) {
        console.error(`Expected value but got null or undefined. Line: ${line}`);
        continue;
      }
      output += `\n\t0AA8: call_method_return ${address} struct [${className}] num_params ${params.length} pop 0`;
      for (const param of params) {
        output += ` [${param}]`;
      }
      output += ` func_ret [${ret}]`;
    }
  } else if (line.includes("plugin_")) {
    output += "\n" + line.substring(line.indexOf("plugin_"));
    curFile = line.replace(":", "");
  } else {
    continue;
  }

  output += "\n";
}

fs.writeFileSync("cleo-calls.txt", output, "utf8");

function assertAddress(s) {
  if (!s.startsWith("0x")) {
    throw new Error(`error: address must start with 0x, got ${s}`);
  }
}

function assertDyn(s) {
  if (!s.includes("gaddrof")) {
    throw new Error(`wrong line ${s}`);
  }
}

function getParams(line) {
  const paramLine = between(line, "(", ")");

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

  return params.map((x) => x.trim());
}

function assertNumParams(num) {
  if (num < 0) {
    throw new Error(`num_params < 0`);
  }
}

function between(line, startChar, endChar) {
  return line.substring(line.indexOf(startChar) + 1, line.lastIndexOf(endChar));
}
