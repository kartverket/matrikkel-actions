import { describe, it, expect, spyOn } from 'bun:test';
import {testContext, yamlMatch} from "./rule.testutils.ts";
import {envGsmSecretRule} from "./envGsmSecretRule.ts";

describe('envGsmSecretRule', () => {
   it('should remove secret references from env and add them to external list', async () => {
       const ctx = testContext(`
            metadata:
              namespace: main
              name: appname
            spec:
              env:
                - name: USERNAME
                  value: publicvalue
                - name: PASSWORD
                  gsmSecretName: gsm-ref 
       `);

       await envGsmSecretRule.apply(ctx);

       yamlMatch(ctx.serialize(), `
            metadata:
              namespace: main
              name: appname
            spec:
              envFrom: 
                - secret: appname-secrets
              env:
                - name: USERNAME
                  value: publicvalue
            ---
            apiVersion: external-secrets.io/v1
            kind: ExternalSecret
            metadata:
              name: appname-externalsecrets
              namespace: main
            spec:
              refreshInterval: 1h
              secretStoreRef:
                kind: SecretStore
                name: gsm
              target:
                name: appname-secrets
              data:
                - secretKey:  PASSWORD
                  remoteRef:
                    key: gsm-ref
                    metadataPolicy: None
       `)

       expect(ctx.appDoc.spec.env).toMatchObject([{ name: 'USERNAME', value: 'publicvalue'}]);
       expect(ctx.generatedExternalSecretData).toMatchObject([{ secretKey: 'PASSWORD', remoteKey: 'gsm-ref' }]);
   });

   it('should validate secret names are correct', () => {
       const ctx = testContext(`
            metadata:
              namespace: main
              name: appname
            spec:
              env:
                - name: ""
                  gsmSecretName: "ref" 
                 
       `);

       expect(async () => await envGsmSecretRule.apply(ctx)).toThrowError();
   });

    it('should validate secret refrences are correct', () => {
        const ctx = testContext(`
            metadata:
              namespace: main
              name: appname
            spec:
              env:
                - name: "name"
                  gsmSecretName: "" 
                 
       `);

        expect(async () => await envGsmSecretRule.apply(ctx)).toThrowError();
    });
});