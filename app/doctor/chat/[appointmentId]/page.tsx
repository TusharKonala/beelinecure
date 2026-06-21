import { getServerSession } from "next-auth/next";
import { Container } from "@/components/layout/Container";
import { ChatThreadView } from "@/components/chat/ChatThreadView";
import { authOptions } from "@/lib/auth";
import { getDoctorAccessStatus } from "@/lib/doctor-access-status";

type PageProps = {
  params: Promise<{ appointmentId: string }>;
};

const chatHeightClass = "h-[calc(100svh-8rem)] w-full";

export default async function DoctorChatThreadPage({ params }: PageProps) {
  const { appointmentId } = await params;

  const session = await getServerSession(authOptions);
  const access = session?.user?.id
    ? await getDoctorAccessStatus(session.user.id)
    : null;
  const showDeactivationBanner =
    access?.found === true && access.isActive === false;

  return (
    <div className="w-full bg-[#fafafa] pb-6 md:py-4 lg:pt-10 lg:pb-6">
      <Container>
        <ChatThreadView
          appointmentId={appointmentId}
          backHref="/doctor/chat"
          backLabel="All chats"
          className={chatHeightClass}
          scrollPageToComposerOnReady={showDeactivationBanner}
        />
      </Container>
    </div>
  );
}
