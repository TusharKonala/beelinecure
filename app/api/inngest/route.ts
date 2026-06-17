import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  cancelHolidayAppointments,
  chatUnreadEmailNotify,
  doctorUnreadChatDigest,
  ensureChatConversationJob,
  lockChatAfter48h,
  processDoctorOverdueAppointments,
  screenCareersApplication,
  sendAppointmentReminder,
  sendCareersApplicationDigest,
  sendInterviewReminder24h,
  sendInterviewReminder30m,
  sendClinicAppointmentT120Reminder,
  sendOnlineAppointmentT15Reminder,
  sendPrescriptionReminder,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    cancelHolidayAppointments,
    sendAppointmentReminder,
    sendOnlineAppointmentT15Reminder,
    sendClinicAppointmentT120Reminder,
    sendPrescriptionReminder,
    processDoctorOverdueAppointments,
    sendCareersApplicationDigest,
    sendInterviewReminder24h,
    sendInterviewReminder30m,
    screenCareersApplication,
    ensureChatConversationJob,
    lockChatAfter48h,
    chatUnreadEmailNotify,
    doctorUnreadChatDigest,
  ],
});
