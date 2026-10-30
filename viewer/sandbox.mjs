import Interpreter from 'js-interpreter';

// No host objects cross this boundary. Only bounded JSON values reach the toolkit.
export function executeScene(code, toolkit) {
  if (typeof code !== 'string' || code.length > 24000)
    throw new Error('Scene source exceeds limit');
  if (/\b(?:constructor|__proto__|prototype|eval|Function|RegExp)\b/.test(code))
    throw new Error('Unsupported dynamic JavaScript capability');
  let calls = 0;
  const interpreter = new Interpreter(code, (vm, scope) => {
    const api = vm.createObjectProto(vm.OBJECT_PROTO);
    for (const name of ['material', 'part', 'action']) {
      vm.setProperty(
        api,
        name,
        vm.createNativeFunction((id, spec) => {
          if (++calls > 150) throw new Error('Too many scene operations');
          if (typeof id !== 'string' || !/^[a-zA-Z][\w-]{0,39}$/.test(id))
            throw new Error('Invalid scene id');
          const json = vm.pseudoToNative(spec);
          if (JSON.stringify(json).length > 12000) throw new Error('Scene operation too large');
          toolkit[name](id, json);
        }));
    }
    vm.setProperty(scope, 'api', api);
  });
  interpreter.REGEXP_MODE = 0;
  const started = Date.now();
  let steps = 0;
  while (interpreter.step()) {
    if (++steps > 120000 || (steps % 1000 === 0 && Date.now() - started > 1500))
      throw new Error('Scene execution limit reached');
  }
}
