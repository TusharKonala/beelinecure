/** Shared demo account credentials for portfolio / manual testing. */
export const DEMO_PATIENT_EMAIL = "beelinecure.patient@gmail.com";
export const DEMO_PATIENT_PASSWORD = "DemoPatient1!";

export const DEMO_DOCTOR_EMAIL = "beelinecure.doctor@gmail.com";
export const DEMO_DOCTOR_PASSWORD = "DemoDoctor1!";

export const DEMO_ACCOUNTS = [
  {
    role: "Patient",
    email: DEMO_PATIENT_EMAIL,
    password: DEMO_PATIENT_PASSWORD,
  },
  {
    role: "Doctor",
    email: DEMO_DOCTOR_EMAIL,
    password: DEMO_DOCTOR_PASSWORD,
  },
] as const;
