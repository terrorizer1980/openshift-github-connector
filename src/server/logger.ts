import express from "express";
import log4js from "log4js";

let _logger: log4js.Logger | undefined;

export const LOG_CATEGORY = "default";

function getLogger(): log4js.Logger {
  if (_logger) {
    return _logger;
  }

  const FILENAME_LEN = 18;

  // https://log4js-node.github.io/log4js-node/layouts.html#Pattern-format
  const loggerLayout = {
    type: "pattern",
    pattern: `%[%-5p %d %${FILENAME_LEN}f{1}:%3l%] | %m`,
  };

  const config = {
    appenders: {
      out: {
        type: "stdout",
        layout: loggerLayout,
      },
      file: {
        // https://log4js-node.github.io/log4js-node/file.html
        type: "file",
        // removes colour
        pattern: loggerLayout.pattern.replace(/%\[/g, "").replace(/%\]/g, ""),
        filename: "server.log",
        maxLogSize: 1024 * 1024,
        keepFileExt: true,
        // flags: "w",   // write instead of append
      },
    },
    categories: {
      [LOG_CATEGORY]: {
        appenders: [ "out", "file" ],
        level: "debug",
        enableCallStack: true,
      },
    },
  };

  log4js.configure(config);
  _logger = log4js.getLogger(LOG_CATEGORY);
  _logger.level = "debug";

  _logger.info("Logger initialized");
  return _logger;
}

export function getLoggingMiddleware(): any {
  // https://github.com/log4js-node/log4js-node/blob/master/docs/connect-logger.md
  return log4js.connectLogger(getLogger(), {
    level: "auto",
    statusRules: [
      { from: 100, to: 399, level: "debug" },
      { codes: [ 404 ], level: "warn" },
    ],
    format: (req: express.Request, res: express.Response, format) => {
      let fmt = `:method :url :status`;
      if (Object.keys(req.body).length > 0) {
        fmt += `\nReceived body:\n${JSON.stringify(req.body)}`;
      }

      return format(fmt);
    },
  });
}

const Log = getLogger();
export default Log;
