import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { formatDoctorDisplayName } from "@/lib/doctor-name";

type DoctorUnreadChatDigestEmailProps = {
  doctorName: string;
  patientNames: string[];
  moreCount: number;
  chatUrl: string;
};

export function DoctorUnreadChatDigestEmailTemplate({
  doctorName,
  patientNames,
  moreCount,
  chatUrl,
}: DoctorUnreadChatDigestEmailProps) {
  const displayDoctorName = formatDoctorDisplayName(doctorName);
  const preview =
    patientNames.length === 1
      ? `New message from ${patientNames[0]}`
      : `${patientNames.length} patients messaged you`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Unread patient messages</Heading>
          <Text style={text}>Hi {displayDoctorName},</Text>
          <Text style={text}>
            You have unread messages from the following patient
            {patientNames.length === 1 ? "" : "s"}:
          </Text>
          <Section style={listSection}>
            {patientNames.map((name) => (
              <Text key={name} style={listItem}>
                • {name}
              </Text>
            ))}
            {moreCount > 0 && (
              <Text style={listItem}>• and {moreCount} more</Text>
            )}
          </Section>
          <Section style={buttonSection}>
            <Button style={button} href={chatUrl}>
              Open chat
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#fafafa",
  fontFamily: "Montserrat, Arial, sans-serif",
};

const container = {
  margin: "0 auto",
  padding: "24px",
  maxWidth: "560px",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
};

const heading = {
  color: "#333333",
  fontSize: "22px",
  fontWeight: "600" as const,
};

const text = {
  color: "#5E5E5E",
  fontSize: "14px",
  lineHeight: "22px",
};

const listSection = {
  margin: "16px 0",
};

const listItem = {
  color: "#333333",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "4px 0",
};

const buttonSection = {
  marginTop: "24px",
};

const button = {
  backgroundColor: "#2555F3",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600" as const,
  textDecoration: "none",
  padding: "12px 20px",
};
