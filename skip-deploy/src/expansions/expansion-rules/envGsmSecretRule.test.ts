import { describe, it, expect, spyOn } from 'bun:test';
import {testContext, yamlMatch} from "./rule.testutils.ts";
import {envGsmSecretRule} from "./envGsmSecretRule.ts";

describe('envGsmSecretRule', () => {
   it('should remove secret references from env and add them to external list', async () => {
       const ctx = testContext(`
            metadata:
              name: appname
              namespace: main
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
              name: appname
              namespace: main
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
       `);
   });

   it('should validate secret names are correct', () => {
       const ctx = testContext(`
            metadata:
              name: appname
              namespace: main
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
              name: appname
              namespace: main
            spec:
              env:
                - name: "name"
                  gsmSecretName: "" 
                 
       `);

        expect(async () => await envGsmSecretRule.apply(ctx)).toThrowError();
    });
});