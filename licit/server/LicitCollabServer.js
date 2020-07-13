// @flow
import url from 'url';
// [FS] IRAD-1004 2020-07-07
const formidable = require('formidable');
// [FS] IRAD-1005 2020-07-07
// Upgrade outdated packages.
const uuidv4 = require('uuid').v4;
const mv = require('mv');
const path = require('path');
const fs = require('fs');

import LicitCollabController from './LicitCollabController';

class LicitCollabServer {
  controller: LicitCollabController;

  constructor() {
    this.controller = new LicitCollabController();
  }

  handleRequest = (request: any, response: any): void => {
    const parsed: Object = url.parse(request.url, true);
    const reqPath = parsed.pathname || '';
    const method = request.method.toUpperCase();
    let skip = false;
    request.path = reqPath;
    //log({ method, reqPath });
    if (method === 'OPTIONS') {
      // For X-Domain Preflught Request
      // https://gist.github.com/nilcolor/816580
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': ';POST, GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Credential': false,
        'Access-Control-Max-Age': 86400, // 24hrs
        'Access-Control-Allow-Headers':
          'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept',
      };
      response.writeHead(200, headers);
      response.end();
    } else if (method === 'POST') {
      // [FS] IRAD-1004 2020-07-07
      // Image upload
      const se = /^\/saveimage/;
      if (se.test(reqPath)) {
        skip = true;
        const form = new formidable.IncomingForm();
        const fileid = uuidv4();
        const query = parsed.query;
        log(query);
        const filename = fileid + '_' + query['fn'];
        const host = request.headers['host'];
        const proto = request.connection.encrypted ? 'https' : 'http';
        log(proto);
        form.parse(request, function (err, fields, blob) {
          const oldpath = blob.file.path;
          const newpath = path.join(
            process.cwd(),
            path.sep,
            'images',
            path.sep,
            filename
          );
          log(oldpath);
          log(newpath);
          mv(oldpath, newpath, function (err) {
            if (err) {
              response.writeHead(500, {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*',
              });
              response.end(
                JSON.stringify({
                  error: err,
                })
              );
              return;
            } else {
              const imgSrc = proto + '://' + host + '/assets/' + filename;
              log(imgSrc);
              const respdata = {
                id: fileid,
                width: 10,
                height: 10,
                src: imgSrc,
              };
              response.writeHead(200, {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*',
              });
              response.end(JSON.stringify(respdata));
              return;
            }
          });
        });
      }

      let body = '';
      if (!skip) {
        request.on('data', function (chunk) {
          log('data');
          if (!skip) {
            body += chunk.toString();
          }
        });
        request.on(
          'end',
          function () {
            log('end');
            if (!skip) {
              // assume data is posted as `application/json`.
              request.params = JSON.parse(String(body));
              // log(body);
              //log(request.params);
              handleServerRequest(this, request, response);
            }
            body = null;
          }.bind(this)
        );
      }
    } else {
      const se = /^\/assets/;
      if (se.test(reqPath)) {
        const str = request.url;
        const filename = str.substring(str.lastIndexOf('/') + 1);
        const newpath = path.join(
          process.cwd(),
          path.sep,
          'images',
          path.sep,
          filename
        );
        // serve static
        fs.readFile(newpath, function (err, data) {
          if (err) {
            response.writeHead(404);
            response.end(JSON.stringify(err));
            return;
          }
          response.writeHead(200);
          response.end(data);
        });
      } else {
        request.params = normalizeParams(parsed.query);
        handleServerRequest(this, request, response);
      }
    }
  };
}

function handleServerRequest(server, request, response) {
  try {
    if (!(server instanceof LicitCollabServer)) {
      throw new Error('invalid server ' + String(server));
    }
    if (!(server.controller instanceof LicitCollabController)) {
      throw new Error('invalid controller ' + String(server.controller));
    }
    if (!request.params) {
      throw new Error('invalid params ' + String(request.params));
    }

    const path = request.path;
    const params = request.params;
    let action;

    let re = /^\/docs\/\d+\/events/;
    if (re.test(path)) {
      const docId = parseInt(path.replace('/docs/', ''), 10) || -1;
      action = 'events';
      params.docId = docId;
    }
    re = /^\/docs\/\d+/;
    if (!action && re.test(path)) {
      const docId = parseInt(path.replace('/docs/', ''), 10) || -1;
      action = 'doc';
      params.docId = docId;
    }

    re = /^\/docs/;
    if (!action && re.test(path)) {
      action = 'all';
      params.docId = null;
    }

    action = request.method.toLowerCase() + '_' + String(action);
    //log(action);
    const responseData = getResponseData(
      server.controller,
      action,
      params,
      request,
      response
    );
    if (!responseData) {
      throw new Error('responseData not found for ' + action);
    }

    if (responseData instanceof Promise) {
      responseData
        .then((data) => {
          response.writeHead(200, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          });
          response.end(JSON.stringify(data, null, 2));
        })
        .catch((error) => {
          response.writeHead(error.status || 500, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          });
          response.end(JSON.stringify(error.message || 'Error', null, 2));
        });
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
    });
    response.end(JSON.stringify(responseData, null, 2));
  } catch (error) {
    console.log(error);
    const params = request.params || null;
    response.writeHead(500, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
    });
    const message =
      (error.message || 'Unknown Error') +
      '\n\nparams\n\n' +
      JSON.stringify(params, null, 2);
    response.end(message);
  }
}

function getResponseData(
  controller: LicitCollabController,
  action: string,
  params: Object,
  request: any,
  response: any
): ?Object {
  const method = String(action);
  // $FlowFixMe
  const fn = controller[method];
  if (typeof fn === 'function') {
    const result = fn.call(controller, params, request, response);
    return Object.assign(result, {
      __action__: action,
    });
  }
  throw new Error('method ' + method + ' is unsupported');
}

function normalizeParams(params: Object) {
  const re = /\d+/;
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (typeof value === 'string' && re.test(value)) {
      params[key] = parseInt(value, 10);
    }
  });
  return params;
}

function log(...args: any): void {
  console.log('==========================================================\n');
  console.log(args.map((a) => JSON.stringify(a)).join(', '));
  console.log('----------------------------------------------------------\n');
}

export default LicitCollabServer;
