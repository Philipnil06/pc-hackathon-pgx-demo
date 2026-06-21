import FHIR from "fhirclient";

export function launch(): void {
  FHIR.oauth2.authorize({
    clientId: "attune",
    scope: "launch openid fhirUser patient/*.read",
    redirectUri: window.location.origin + "/app",
  });
}

export function ready() {
  return FHIR.oauth2.ready();
}
