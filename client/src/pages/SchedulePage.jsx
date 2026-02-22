import { useEffect, useMemo, useState } from "react";
import { adminApi, fhirApi } from "../api.js";
import {
  buildDailySlots,
  getDayRangeFromDateInput,
  getNextBookableDateInput,
  getPractitionerIdFromAppointment,
  SERVICE_CATEGORY_OPTIONS,
  getSlotRange,
  isBlockingAppointmentStatus,
  isBookableDateInput,
  isSlotUnavailable,
  practitionerHasAvailableSlot
} from "../utils/scheduling.js";
import {
  bundleToResources,
  formatDateTime,
  patientFullName,
  patientIdentifier,
  reasonText
} from "../utils/fhir.js";
import { calculateNoShowRate, calculateServiceMix } from "../utils/clinicalOps.js";
import { useAuth } from "../context/AuthContext.jsx";

const canEdit = (role) => role === "admin" || role === "practitioner";

const emptyForm = {
  patientId: "",
  appointmentDate: getNextBookableDateInput(),
  slotValue: "",
  practitionerId: "",
  serviceCategory: "Outpatient",
  description: "",
  reason: "",
  comment: ""
};

const SchedulePage = () => {
  const { token, user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [practitioners, setPractitioners] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [slotAppointments, setSlotAppointments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const patientMap = useMemo(() => {
    const map = new Map();
    patients.forEach((patient) => {
      map.set(patient.id, `${patientFullName(patient)} (${patientIdentifier(patient)})`);
    });
    return map;
  }, [patients]);

  const practitionerMap = useMemo(() => {
    const map = new Map();
    practitioners.forEach((practitioner) => {
      map.set(practitioner.id, practitioner);
    });
    return map;
  }, [practitioners]);

  const scopedPractitioners = useMemo(() => {
    if (user.role === "practitioner") {
      return practitioners.filter((practitioner) => practitioner.id === user.id);
    }

    return practitioners;
  }, [practitioners, user.id, user.role]);

  const availablePractitioners = useMemo(() => {
    return scopedPractitioners.filter((practitioner) =>
      practitionerHasAvailableSlot({
        appointments: slotAppointments,
        practitionerId: practitioner.id,
        dateInput: form.appointmentDate
      })
    );
  }, [form.appointmentDate, scopedPractitioners, slotAppointments]);

  const slotOptions = useMemo(() => {
    const slots = buildDailySlots();

    return slots.map((slot) => ({
      ...slot,
      unavailable:
        !form.practitionerId ||
        isSlotUnavailable({
          appointments: slotAppointments,
          practitionerId: form.practitionerId,
          dateInput: form.appointmentDate,
          slotValue: slot.value
        })
    }));
  }, [form.appointmentDate, form.practitionerId, slotAppointments]);

  const loadAppointmentsTable = async () => {
    const from = fromDate ? getDayRangeFromDateInput(fromDate).start.toISOString() : undefined;
    const to = toDate ? getDayRangeFromDateInput(toDate).end.toISOString() : undefined;

    const response = await fhirApi.listAppointments(token, {
      from,
      to
    });

    setAppointments(bundleToResources(response));
  };

  const loadSlotAppointments = async (dateInput) => {
    if (!isBookableDateInput(dateInput)) {
      setSlotAppointments([]);
      return;
    }

    const { start, end } = getDayRangeFromDateInput(dateInput);
    const response = await fhirApi.listAppointments(token, {
      from: start.toISOString(),
      to: end.toISOString()
    });

    setSlotAppointments(bundleToResources(response));
  };

  const loadBaseData = async () => {
    const [patientBundle, practitionerResponse] = await Promise.all([
      fhirApi.listPatients(token),
      adminApi.listPractitioners(token)
    ]);

    const patientResources = bundleToResources(patientBundle);
    const practitionerResources = practitionerResponse.data || [];

    setPatients(patientResources);
    setPractitioners(practitionerResources);

    setForm((prev) => {
      const nextPatientId = prev.patientId || patientResources[0]?.id || "";
      const nextPractitionerId =
        user.role === "practitioner"
          ? user.id
          : prev.practitionerId || practitionerResources[0]?.id || "";

      return {
        ...prev,
        patientId: nextPatientId,
        practitionerId: nextPractitionerId
      };
    });
  };

  useEffect(() => {
    loadBaseData().catch((err) => setError(err.message || "Unable to load schedule"));
  }, [token, user.id, user.role]);

  useEffect(() => {
    loadAppointmentsTable().catch((err) => setError(err.message || "Unable to load schedule"));
  }, [token, fromDate, toDate]);

  useEffect(() => {
    loadSlotAppointments(form.appointmentDate).catch((err) =>
      setError(err.message || "Unable to load slot availability")
    );
  }, [token, form.appointmentDate]);

  useEffect(() => {
    setForm((prev) => {
      let nextPractitionerId = prev.practitionerId;

      if (user.role === "practitioner") {
        nextPractitionerId = user.id;
      } else if (!availablePractitioners.some((practitioner) => practitioner.id === prev.practitionerId)) {
        nextPractitionerId = availablePractitioners[0]?.id || "";
      }

      if (nextPractitionerId === prev.practitionerId) {
        return prev;
      }

      return {
        ...prev,
        practitionerId: nextPractitionerId
      };
    });
  }, [availablePractitioners, user.id, user.role]);

  useEffect(() => {
    setForm((prev) => {
      const slotStillAvailable = slotOptions.some(
        (slot) => slot.value === prev.slotValue && !slot.unavailable
      );

      if (slotStillAvailable) {
        return prev;
      }

      const firstAvailable = slotOptions.find((slot) => !slot.unavailable)?.value || "";

      if (firstAvailable === prev.slotValue) {
        return prev;
      }

      return {
        ...prev,
        slotValue: firstAvailable
      };
    });
  }, [slotOptions]);

  const onCreateAppointment = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!isBookableDateInput(form.appointmentDate)) {
        throw new Error("Appointments can only be booked Monday to Saturday");
      }

      const practitioner = practitionerMap.get(form.practitionerId);
      if (!practitioner) {
        throw new Error("Select an available practitioner");
      }

      const slotRange = getSlotRange(form.appointmentDate, form.slotValue);
      if (!slotRange) {
        throw new Error("Select a valid appointment slot");
      }

      const resource = {
        resourceType: "Appointment",
        status: "booked",
        description: form.description,
        serviceCategory: form.serviceCategory ? [{ text: form.serviceCategory }] : undefined,
        start: slotRange.start.toISOString(),
        end: slotRange.end.toISOString(),
        minutesDuration: 15,
        participant: [
          {
            actor: {
              reference: `Patient/${form.patientId}`
            },
            status: "accepted"
          },
          {
            actor: {
              reference: `Practitioner/${practitioner.id}`,
              display: practitioner.fullName
            },
            status: "accepted"
          }
        ],
        reasonCode: form.reason ? [{ text: form.reason }] : undefined,
        comment: form.comment || undefined
      };

      await fhirApi.createAppointment(token, resource);

      setForm((prev) => ({
        ...prev,
        slotValue: "",
        description: "",
        reason: "",
        comment: ""
      }));

      await Promise.all([loadAppointmentsTable(), loadSlotAppointments(form.appointmentDate)]);
    } catch (err) {
      setError(err.message || "Unable to create appointment");
    } finally {
      setLoading(false);
    }
  };

  const appointmentPatient = (appointment) => {
    const patientReference = appointment.participant?.find((participant) =>
      String(participant.actor?.reference || "").startsWith("Patient/")
    )?.actor?.reference;

    const patientId = patientReference ? patientReference.split("/")[1] : "";
    return patientMap.get(patientId) || patientReference || "-";
  };

  const appointmentPractitioner = (appointment) => {
    const practitionerId = getPractitionerIdFromAppointment(appointment);
    const practitioner = practitionerMap.get(practitionerId);

    if (practitioner?.fullName) {
      return practitioner.fullName;
    }

    const participant = appointment.participant?.find((record) =>
      String(record.actor?.reference || "").startsWith("Practitioner/")
    );

    return participant?.actor?.display || participant?.actor?.reference || "-";
  };

  const serviceFilterOptions = useMemo(() => {
    const dynamicOptions = appointments
      .map(
        (appointment) =>
          appointment?.serviceCategory?.[0]?.text ||
          appointment?.serviceCategory?.[0]?.coding?.[0]?.display ||
          ""
      )
      .filter(Boolean);

    return Array.from(new Set([...SERVICE_CATEGORY_OPTIONS, ...dynamicOptions])).sort();
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      if (statusFilter !== "all" && appointment.status !== statusFilter) {
        return false;
      }

      const service =
        appointment?.serviceCategory?.[0]?.text ||
        appointment?.serviceCategory?.[0]?.coding?.[0]?.display ||
        "Unspecified";

      if (serviceFilter !== "all" && service !== serviceFilter) {
        return false;
      }

      return true;
    });
  }, [appointments, serviceFilter, statusFilter]);

  const operationsSnapshot = useMemo(() => {
    const totalSlots = buildDailySlots().length * scopedPractitioners.length;
    const bookedSlots = slotAppointments.filter((appointment) =>
      isBlockingAppointmentStatus(appointment.status)
    ).length;
    const fillRate = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 1000) / 10 : 0;
    const checkedInCount = appointments.filter((appointment) =>
      ["arrived", "checked-in", "fulfilled"].includes(appointment.status)
    ).length;
    const waitlistCount = appointments.filter((appointment) => appointment.status === "waitlist").length;
    const noShowRate = calculateNoShowRate(appointments, 90);
    const serviceMix = calculateServiceMix(filteredAppointments).slice(0, 3);

    return {
      fillRate,
      bookedSlots,
      totalSlots,
      checkedInCount,
      waitlistCount,
      noShowRate,
      serviceMix
    };
  }, [appointments, filteredAppointments, scopedPractitioners.length, slotAppointments]);

  const hasAvailableSlots = slotOptions.some((slot) => !slot.unavailable);

  const canSubmit =
    loading ||
    !form.patientId ||
    !form.practitionerId ||
    !form.slotValue ||
    !isBookableDateInput(form.appointmentDate) ||
    !hasAvailableSlots;

  return (
    <section className="stack-gap">
      <h1>Schedule</h1>
      <p className="muted-text">Appointment scheduling in 15-minute slots (09:00 AM-12:00 PM, Mon-Sat).</p>
      {error ? <p className="banner banner-error">{error}</p> : null}

      {canEdit(user.role) ? (
        <form className="card form-grid two-columns" onSubmit={onCreateAppointment}>
          <h2>Book appointment</h2>
          <label>
            Patient
            <select
              value={form.patientId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, patientId: event.target.value }))
              }
              required
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patientFullName(patient)} ({patientIdentifier(patient)})
                </option>
              ))}
            </select>
          </label>

          <label>
            Date
            <input
              type="date"
              value={form.appointmentDate}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, appointmentDate: event.target.value }))
              }
              required
            />
          </label>

          <label>
            Practitioner
            <select
              value={form.practitionerId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, practitionerId: event.target.value }))
              }
              disabled={user.role === "practitioner"}
              required
            >
              {availablePractitioners.map((practitioner) => (
                <option key={practitioner.id} value={practitioner.id}>
                  {practitioner.fullName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Slot
            <select
              value={form.slotValue}
              onChange={(event) => setForm((prev) => ({ ...prev, slotValue: event.target.value }))}
              required
            >
              <option value="" disabled>Choose a slot</option>
              {slotOptions.map((slot) => (
                <option key={slot.value} value={slot.value} disabled={slot.unavailable}>
                  {slot.label}{slot.unavailable ? " (Unavailable)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Service category
            <select
              value={form.serviceCategory}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, serviceCategory: event.target.value }))
              }
              required
            >
              {SERVICE_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <input
              value={form.reason}
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
            />
          </label>
          <label className="label-span-2">
            Description
            <input
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </label>
          <label className="label-span-2">
            Comment
            <textarea
              rows="3"
              value={form.comment}
              onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
            />
          </label>

          {!isBookableDateInput(form.appointmentDate) ? (
            <p className="banner banner-error label-span-2">
              Slots are available Monday-Saturday only.
            </p>
          ) : null}

          {hasAvailableSlots ? null : (
            <p className="banner banner-error label-span-2">
              No available slots for the selected date/practitioner.
            </p>
          )}

          <button type="submit" className="button" disabled={canSubmit}>
            {loading ? "Saving..." : "Create appointment"}
          </button>
        </form>
      ) : null}

      <article className="stats-grid">
        <div className="metric-card">
          <h2>Selected-day fill rate</h2>
          <p className="metric-value">{operationsSnapshot.fillRate}%</p>
          <p className="muted-text">
            {operationsSnapshot.bookedSlots}/{operationsSnapshot.totalSlots} bookable slots used.
          </p>
        </div>
        <div className="metric-card">
          <h2>No-show rate</h2>
          <p className="metric-value">{operationsSnapshot.noShowRate}%</p>
          <p className="muted-text">Trailing 90-day trend.</p>
        </div>
        <div className="metric-card">
          <h2>Checked-in visits</h2>
          <p className="metric-value">{operationsSnapshot.checkedInCount}</p>
          <p className="muted-text">Arrived/checked-in/fulfilled in current query window.</p>
        </div>
        <div className="metric-card">
          <h2>Waitlist</h2>
          <p className="metric-value">{operationsSnapshot.waitlistCount}</p>
          <p className="muted-text">Appointments currently on waitlist status.</p>
        </div>
      </article>

      <article className="card form-grid two-columns">
        <h2>Schedule filters</h2>
        <label>
          From
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label>
          To
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="booked">booked</option>
            <option value="arrived">arrived</option>
            <option value="checked-in">checked-in</option>
            <option value="fulfilled">fulfilled</option>
            <option value="waitlist">waitlist</option>
            <option value="noshow">noshow</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
        <label>
          Service category
          <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
            <option value="all">All services</option>
            {serviceFilterOptions.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </label>
      </article>

      <article className="card">
        <h2>Upcoming and historical appointments</h2>
        {operationsSnapshot.serviceMix.length > 0 ? (
          <p className="muted-text">
            Top service mix:{" "}
            {operationsSnapshot.serviceMix
              .map((item) => `${item.service} (${item.count})`)
              .join(" | ")}
          </p>
        ) : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Patient</th>
                <th>Practitioner</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td>{formatDateTime(appointment.start)}</td>
                  <td>{formatDateTime(appointment.end)}</td>
                  <td>{appointmentPatient(appointment)}</td>
                  <td>{appointmentPractitioner(appointment)}</td>
                  <td>{appointment.status || "-"}</td>
                  <td>{reasonText(appointment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
};

export default SchedulePage;
