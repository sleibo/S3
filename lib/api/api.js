import querystring from 'querystring';

import { auth, policies, errors } from 'arsenal';

import bucketDelete from './bucketDelete';
import bucketGet from './bucketGet';
import bucketGetACL from './bucketGetACL';
import bucketHead from './bucketHead';
import bucketPut from './bucketPut';
import bucketPutACL from './bucketPutACL';
import completeMultipartUpload from './completeMultipartUpload';
import initiateMultipartUpload from './initiateMultipartUpload';
import listMultipartUploads from './listMultipartUploads';
import listParts from './listParts';
import multipartDelete from './multipartDelete';
import objectCopy from './objectCopy';
import objectDelete from './objectDelete';
import objectGet from './objectGet';
import objectGetACL from './objectGetACL';
import objectHead from './objectHead';
import objectPut from './objectPut';
import objectPutACL from './objectPutACL';
import objectPutPart from './objectPutPart';
import serviceGet from './serviceGet';
import vault from '../auth/vault';

const RequestContext = policies.RequestContext;
auth.setAuthHandler(vault);

const api = {
    callApiMethod(apiMethod, request, log, callback, locationConstraint) {
        if (apiMethod === 'objectCopy') {
            const source =
                querystring.unescape(request.headers['x-amz-copy-source']);
            const firstSlash = source.indexOf('/');
            if (firstSlash === -1) {
                return callback(errors.InvalidArgument);
            }
            const sourceBucket = source.slice(0, firstSlash);
            const sourceObject = source.slice(firstSlash + 1);
            const getRequestContext = new RequestContext(request.headers,
                request.query, sourceBucket, sourceObject,
                request.socket.remoteAddress, request.connection.encrypted,
                'objectGet', 's3', locationConstraint);

            return auth.doAuth(request, log, err => {
                if (err) {
                    log.trace('auth error on get portion of request');
                    return callback(err);
                }
                const putRequestContext = new RequestContext(request.headers,
                    request.query, request.bucketName, request.objectKey,
                    request.socket.remoteAddress, request.connection.encrypted,
                    'objectPut', 's3', locationConstraint);
                return auth.doAuth(request, log, (err, authInfo) => {
                    if (err) {
                        log.trace('auth error on put portion of request');
                        return callback(err);
                    }
                    return objectCopy(authInfo, request, sourceBucket,
                        sourceObject, log, callback);
                }, 's3', putRequestContext);
            }, 's3', getRequestContext);
        }
        const requestContext = new RequestContext(request.headers,
            request.query, request.bucketName, request.objectKey,
            request.socket.remoteAddress, request.connection.encrypted,
            apiMethod, 's3', locationConstraint);
        return auth.doAuth(request, log, (err, authInfo) => {
            if (err) {
                log.trace('authentication error', { error: err });
                return callback(err);
            }
            if (apiMethod === 'bucketPut') {
                return bucketPut(authInfo, request, locationConstraint,
                    log, callback);
            }
            return this[apiMethod](authInfo, request, log, callback);
        }, 's3', requestContext);
    },
    bucketDelete,
    bucketGet,
    bucketGetACL,
    bucketHead,
    bucketPut,
    bucketPutACL,
    completeMultipartUpload,
    initiateMultipartUpload,
    listMultipartUploads,
    listParts,
    multipartDelete,
    objectDelete,
    objectGet,
    objectGetACL,
    objectCopy,
    objectHead,
    objectPut,
    objectPutACL,
    objectPutPart,
    serviceGet,
};

export default api;
