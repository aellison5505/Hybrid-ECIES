"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ECIES = void 0;
var crypto_1 = require("crypto");
/**
 * Hybred EC encrytion scheme that EC curve secp256k1, and chacha20-poly1305 to encrypt data.
 * The returned data is a packed Buffer with the public key, nonce, tag, and encrypted data.
 */
var ECIES = /** @class */ (function () {
    function ECIES() {
    }
    /**
     * This creates a EC secp256k1 key pair and returns the private key as a buffer.
     * @returns EC Private Key as a Buffer
     */
    ECIES.prototype.createKeyPair = function () {
        var ec = crypto_1.createECDH('secp256k1');
        ec.generateKeys();
        return ec.getPrivateKey();
    };
    /**
     * This returns the calculated secret from a private and public key.
     *
     * @param privateKey: Buffer
     * @param publicKey: Buffer
     * @returns secret
     */
    ECIES.prototype.getSecret = function (privateKey, publicKey) {
        var ec = crypto_1.createECDH('secp256k1');
        ec.setPrivateKey(privateKey);
        return ec.computeSecret(publicKey);
    };
    /**
     * Takes EC private key and returns the public key.
     *
     * @param privateKey EC Private Key
     * @param compress If true return only the x value
     * @returns publicKey X,Y buffer
     */
    ECIES.prototype.getPublicKey = function (privateKey, compress) {
        var ec = crypto_1.createECDH('secp256k1');
        ec.setPrivateKey(privateKey);
        // console.log('pub', ec.getPublicKey('hex'));
        // console.log('pub',Buffer.from(ec.getPublicKey('latin1'), 'latin1').toString('hex'));
        return (compress === true ? Buffer.from(ec.getPublicKey('hex', 'compressed'), 'hex') : ec.getPublicKey());
    };
    /**
     * This takes an EC private key and returns the JWK.
     *
     * @param privateKey EC private key
     * @returns Json Web Token
     */
    ECIES.prototype.privateJWK = function (privateKey) {
        var ec = crypto_1.createECDH('secp256k1');
        ec.setPrivateKey(privateKey);
        var jwk = this.publicJWK(ec.getPublicKey());
        jwk.d = privateKey.toString('base64');
        return jwk;
    };
    /**
     * This takes an EC public key and returns the JWK.
     *
     * @param publicKey EC Public Key
     * @returns Json Web Token
     */
    ECIES.prototype.publicJWK = function (publicKey) {
        var x;
        var y;
        var jwk = {
            "kty": "EC",
            "crv": "secp256k1",
            "kid": "1",
            "x": ""
        };
        switch (publicKey.length) {
            case 33:
                jwk.x = publicKey.toString('base64');
                break;
            case 65:
                var bufX = Buffer.alloc(32);
                var bufY = Buffer.alloc(32);
                publicKey.copy(bufX, 0, 1, 33);
                publicKey.copy(bufY, 0, 33);
                jwk.x = bufX.toString('base64');
                jwk.y = bufY.toString('base64');
                break;
            case 64:
                bufX = Buffer.alloc(32);
                bufY = Buffer.alloc(32);
                publicKey.copy(bufX, 0, 0, 32);
                publicKey.copy(bufY, 0, 32);
                jwk.x = bufX.toString('base64');
                jwk.y = bufY.toString('base64');
                break;
            default:
                var err = new Error('Invaild Key');
                err.name = 'Invaild_Key';
                throw err;
        }
        jwk.kid = crypto_1.createHash('sha256').update(publicKey).digest().toString('base64');
        return jwk;
    };
    /**
     * Return a Buffer from either a public or private JWK.
     *
     * @param jwk  public or private JSON Web Key
     * @returns Buffer of either public or private key
     */
    ECIES.prototype.JWKtoBuffer = function (jwk) {
        if (jwk.d) {
            return Buffer.from(jwk.d, 'base64');
        }
        else if (jwk.y) {
            return Buffer.concat([Buffer.alloc(1, 0x04), Buffer.from(jwk.x, 'base64'), Buffer.from(jwk.y, 'base64')]);
        }
        else {
            return Buffer.from(jwk.x, 'base64');
        }
    };
    /**
     * This takes an EC public key as input, creates an EC pair to encrypt the data.
     * Returns a packed buffer of the EC public key, nonce, tag, and encrypted data.
     * @param publicKey EC Public Key
     * @param data Data to encrypt
     * @returns Buffer(Bytes) - ECPubKey(32) nonce(12) tag(16) encData(variable)
     */
    ECIES.prototype.encryptChaCha20 = function (publicKey, data) {
        var nonce = Buffer.alloc(12);
        crypto_1.randomFillSync(nonce);
        // console.log('nonce', nonce.toString('hex'));
        var tempKey = this.createKeyPair();
        var key = this.getSecret(tempKey, publicKey);
        // console.log('key', key.toString('hex'));
        var cipher = crypto_1.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
        var encData = cipher.update(data);
        cipher.final();
        var tag = cipher.getAuthTag();
        // console.log('data enc ', encData.toString('hex'));
        // console.log('tag', tag.toString('hex'));
        // console.log('enc pub', this.getPublicKey(tempKey, true).toString('hex'));
        var pack = Buffer.concat([this.getPublicKey(tempKey, true), nonce, tag, encData]);
        // console.log(pack.toString('hex'));
        // console.log(pack.toString('base64'));
        return pack;
    };
    /**
     * Takes private EC key of the public key used to encrypt the data and decrypts it.
     *
     * @param privateKey EC Key used to encrypt the data.
     * @param encodedData Buffer(Bytes) - ECPubKey(32) nonce(12) tag(16) encData(variable)
     * @returns Buffer of decrypted data.
     */
    ECIES.prototype.decryptChaCha20 = function (privateKey, encodedData) {
        var pubKey = Buffer.alloc(33);
        encodedData.copy(pubKey, 0, 0, 33);
        var nonce = Buffer.alloc(12);
        encodedData.copy(nonce, 0, 33, (33 + 12));
        var tag = Buffer.alloc(16);
        encodedData.copy(tag, 0, (33 + 12), (33 + 12 + 16));
        var data = Buffer.alloc(encodedData.length - (33 + 12 + 16));
        encodedData.copy(data, 0, (33 + 12 + 16));
        var key = this.getSecret(privateKey, pubKey);
        // console.log('key', key.toString('hex'));
        // console.log('pubKey', pubKey.toString('hex'));
        // console.log('nonce', nonce.toString('hex'));
        // console.log('tag', tag.toString('hex'));
        var dec = crypto_1.createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
        dec.setAuthTag(tag);
        var decData = dec.update(data);
        dec.final();
        // console.log('mdg', decData.toString());
        return decData;
    };
    return ECIES;
}());
exports.ECIES = ECIES;