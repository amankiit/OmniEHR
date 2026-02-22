export const bundleToResources = (bundle) => {
  if (!bundle?.entry || !Array.isArray(bundle.entry)) {
    return [];
  }

  return bundle.entry.map((entry) => entry.resource).filter(Boolean);
};

export const patientFullName = (patient) => {
  const name = patient?.name?.[0] || {};
  const given = (name.given || []).join(" ").trim();
  const family = (name.family || "").trim();
  return `${given} ${family}`.trim() || "Unknown";
};

export const patientIdentifier = (patient) => {
  return patient?.identifier?.[0]?.value || "-";
};

export const patientPid = (patient) => {
  return (
    patient?.identifier?.find((identifier) => identifier.system === "urn:pid")?.value || "-"
  );
};

export const patientMrn = (patient) => {
  return (
    patient?.identifier?.find((identifier) => identifier.system === "urn:mrn")?.value || "-"
  );
};

export const patientContact = (patient) => {
  const telecom = patient?.telecom || [];
  const phone = telecom.find((item) => item.system === "phone")?.value;
  const email = telecom.find((item) => item.system === "email")?.value;
  return { phone: phone || "-", email: email || "-" };
};

export const patientAddress = (patient) => {
  const address = patient?.address?.[0];
  if (!address) {
    return "-";
  }

  const line = (address.line || []).join(" ");
  return [line, address.city, address.state, address.postalCode].filter(Boolean).join(", ");
};

export const observationValue = (observation) => {
  const quantity = observation?.valueQuantity;
  if (!quantity || quantity.value === undefined) {
    return "-";
  }

  return `${quantity.value}${quantity.unit ? ` ${quantity.unit}` : ""}`;
};

export const pickCodingDisplay = (resource, fallback = "-") => {
  const coding = resource?.code?.coding?.[0];
  if (!coding) {
    return fallback;
  }

  return coding.display || coding.code || fallback;
};

export const pickCodingCode = (resource, fallback = "-") => {
  const coding = resource?.code?.coding?.[0];
  if (!coding) {
    return fallback;
  }

  return coding.code || fallback;
};

export const medicationDisplay = (medicationRequest) => {
  const coding = medicationRequest?.medicationCodeableConcept?.coding?.[0];
  return coding?.display || coding?.code || "-";
};

export const reasonText = (resource) => {
  const text = resource?.reasonCode?.[0]?.text;
  if (text) {
    return text;
  }

  const coding = resource?.reasonCode?.[0]?.coding?.[0];
  return coding?.display || coding?.code || "-";
};

export const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

export const splitEverythingBundle = (bundle) => {
  const resources = bundleToResources(bundle);

  const grouped = {
    patient: null,
    observations: [],
    conditions: [],
    allergies: [],
    medications: [],
    encounters: [],
    appointments: []
  };

  resources.forEach((resource) => {
    switch (resource.resourceType) {
      case "Patient":
        grouped.patient = resource;
        break;
      case "Observation":
        grouped.observations.push(resource);
        break;
      case "Condition":
        grouped.conditions.push(resource);
        break;
      case "AllergyIntolerance":
        grouped.allergies.push(resource);
        break;
      case "MedicationRequest":
        grouped.medications.push(resource);
        break;
      case "Encounter":
        grouped.encounters.push(resource);
        break;
      case "Appointment":
        grouped.appointments.push(resource);
        break;
      default:
        break;
    }
  });

  return grouped;
};
