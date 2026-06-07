const ts = require('typescript');

module.exports = {
  process(sourceText, sourcePath) {
    const result = ts.transpileModule(sourceText, {
      fileName: sourcePath,
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        sourceMap: true,
        target: ts.ScriptTarget.ES2018,
      },
    });

    return {
      code: result.outputText,
      map: result.sourceMapText ? JSON.parse(result.sourceMapText) : undefined,
    };
  },
};
