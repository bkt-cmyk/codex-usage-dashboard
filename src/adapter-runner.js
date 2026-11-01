// Reuse the installation's generation-aware Python bootstrap, never hard-code its tool-store version.
export function adapterCommand(runtime, path) {
  const entry="runpy.run_module('hermes_cli.main', run_name='__main__', alter_sys=True)";
  if (!Array.isArray(runtime) || runtime.length!==4 || runtime[1]!=='-I' || runtime[2]!=='-c' || typeof runtime[3]!=='string' || !runtime[3].endsWith(entry)) throw new Error('Unsupported Hermes runtime launcher');
  return [runtime[0],'-I','-c',runtime[3].slice(0,-entry.length)+"runpy.run_path(sys.argv[1], run_name='__main__')",path];
}
