import { errors } from 'arsenal';
import { parseString } from 'xml2js';

import api from '../api/api';
import routesUtils from './routesUtils';
import utils from '../utils';
import constants from '../../constants';

export default function routePUT(request, response, log) {
    log.debug('routing request', { method: 'routePUT' });

    if (request.objectKey === undefined || request.objectKey === '/') {
        request.post = '';
        request.on('data', chunk => request.post += chunk.toString());

        request.on('end', () => {
            // PUT bucket ACL
            if (request.query.acl !== undefined) {
                api.callApiMethod('bucketPutACL', request, log, (err) =>
                    routesUtils.responseNoBody(err, null, response, 200, log));
            } else if (request.query.acl === undefined) {
                // PUT bucket
                if (request.post) {
                    const xmlToParse = request.post;
                    return parseString(xmlToParse, (err, result) => {
                        if (err || !result.CreateBucketConfiguration
                            || !result.CreateBucketConfiguration
                                .LocationConstraint
                            || !result.CreateBucketConfiguration
                                .LocationConstraint[0]) {
                            log.debug('request xml is malformed');
                            return routesUtils.responseNoBody(errors
                                .MalformedXML,
                                null, response, null, log);
                        }
                        const locationConstraint =
                            result.CreateBucketConfiguration
                            .LocationConstraint[0];
                        log.trace('location constraint',
                            { locationConstraint });
                        return api.callApiMethod('bucketPut', request, log,
                        err =>
                            routesUtils.responseNoBody(err, null,
                                response, 200, log), locationConstraint);
                    });
                }
                return api.callApiMethod('bucketPut', request, log, err =>
                    routesUtils.responseNoBody(err, null, response, 200, log));
            }
        });
    } else {
        // PUT object, PUT object ACL, PUT object multipart or
        // PUT object copy
        // if content-md5 is not present in the headers, try to
        // parse content-md5 from meta headers
        if (request.headers['content-md5']) {
            request.contentMD5 = request.headers['content-md5'];
        } else {
            request.contentMD5 = utils.parseContentMD5(request.headers);
        }
        if (request.contentMD5 && request.contentMD5.length !== 32) {
            request.contentMD5 = new Buffer(request.contentMD5, 'base64')
                .toString('hex');
            if (request.contentMD5 && request.contentMD5.length !== 32) {
                log.warn('invalid md5 digest', {
                    contentMD5: request.contentMD5,
                });
                return routesUtils
                    .responseNoBody(errors.InvalidDigest, null, response, 200,
                                    log);
            }
        }
        if (request.query.partNumber) {
            api.callApiMethod('objectPutPart', request, log, err => {
                // ETag's hex should always be enclosed in quotes
                const resMetaHeaders = { ETag: `"${request.calculatedHash}"` };
                routesUtils.responseNoBody(err, resMetaHeaders, response,
                    200, log);
            });
        } else if (request.query.acl !== undefined) {
            request.post = '';
            request.on('data', chunk => request.post += chunk.toString());
            request.on('end', () => {
                api.callApiMethod('objectPutACL', request, log, (err) =>
                    routesUtils.responseNoBody(err, null, response, 200, log));
            });
        } else if (request.headers['x-amz-copy-source']) {
            return api.callApiMethod('objectCopy', request, log, (err, xml) =>
                routesUtils.responseXMLBody(err, xml, response, log)
            );
        } else {
            if (!request.headers['content-length']) {
                return routesUtils.responseNoBody(errors.MissingContentLength,
                    null, response, 411, log);
            }
            if (Number.isNaN(request.parsedContentLength)) {
                return routesUtils.responseNoBody(errors.InvalidArgument,
                    null, response, 400, log);
            }
            log.end().addDefaultFields({
                contentLength: request.headers['content-length'],
            });
            api.callApiMethod('objectPut', request, log, (err) => {
                if (request.parsedContentLength === 0) {
                    // Calculation is coming from sproxyd client.
                    // If no content, no need to go through sproxyd so
                    // just sent empty file hash.
                    request.calculatedHash = constants.emptyFileMd5;
                }
                // ETag's hex should always be enclosed in quotes
                const resMetaHeaders = { ETag: `"${request.calculatedHash}"` };
                routesUtils.responseNoBody(err, resMetaHeaders, response,
                    200, log);
            });
        }
    }
}
