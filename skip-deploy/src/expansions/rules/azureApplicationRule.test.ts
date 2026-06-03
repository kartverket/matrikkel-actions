import {describe, it} from 'bun:test';
import {testContext, yamlMatch} from "./rule.testutils.ts";
import {azureApplicationRule} from "./azureApplicationRule.ts";


describe('', () => {
    it('should expand', async () => {
        const ctx = testContext(`
        metadata:
          name: appname
          namespace: main
        spec:
          azure:
            application:
              enabled: true
        `);

        await azureApplicationRule.apply(ctx);

        yamlMatch(ctx.serialize(), `
            metadata:
              name: appname
              namespace: main
            spec:
              accessPolicy:
                outbound:
                  external:
                    - host: login.microsoftonline.com
              env:
                - name: AZURE_APP_CLIENT_ID 
                  valueFrom:
                    secretKeyRef:
                      name: azuread-appname
                      key: AZURE_APP_CLIENT_ID
                - name: AZURE_APP_CLIENT_SECRET 
                  valueFrom:
                    secretKeyRef:
                      name: azuread-appname
                      key: AZURE_APP_CLIENT_SECRET
                - name: AZURE_APP_JWK 
                  valueFrom:
                    secretKeyRef:
                      name: azuread-appname
                      key: AZURE_APP_JWK
                - name: AZURE_APP_JWKS 
                  valueFrom:
                    secretKeyRef:
                      name: azuread-appname
                      key: AZURE_APP_JWKS
                - name: AZURE_APP_TENANT_ID 
                  valueFrom:
                    secretKeyRef:
                      name: azuread-appname
                      key: AZURE_APP_TENANT_ID
                - name: AZURE_APP_WELL_KNOWN_URL 
                  valueFrom:
                    secretKeyRef:
                      name: azuread-appname
                      key: AZURE_APP_WELL_KNOWN_URL
                - name: AZURE_OPENID_CONFIG_ISSUER 
                  valueFrom:
                    secretKeyRef:
                      name: azuread-appname
                      key: AZURE_OPENID_CONFIG_ISSUER
                - name: AZURE_OPENID_CONFIG_JWKS_URI 
                  valueFrom:
                    secretKeyRef:
                      name: azuread-appname
                      key: AZURE_OPENID_CONFIG_JWKS_URI
                - name: AZURE_OPENID_CONFIG_TOKEN_ENDPOINT 
                  valueFrom:
                    secretKeyRef:
                      name: azuread-appname
                      key: AZURE_OPENID_CONFIG_TOKEN_ENDPOINT
            ---
            apiVersion: nais.io/v1
            kind: AzureAdApplication
            metadata:
              name: appname
              namespace: main
            spec:
              secretName: azuread-appname
              allowAllUsers: false
              singlePageApplication: false
              claims:
                groups:
                  - id: efa96215-e137-4850-bc85-744a869f6ef5 # AAD - TF - Team Heimdall
       `)
    });
});