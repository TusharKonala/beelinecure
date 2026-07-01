import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { getPostLoginPath } from "@/lib/post-login-redirect";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Staff aren't allowed to book through the patient flow.
    // Anonymous and patient users pass through; logged-in DOCTOR/ADMIN users
    // are redirected to their own dashboards.
    if (pathname.startsWith("/book-appointment")) {
      if (token?.role === "DOCTOR") {
        return NextResponse.redirect(new URL("/doctor/overview", req.url));
      }
      if (token?.role === "ADMIN") {
        return NextResponse.redirect(new URL("/admin/appointments", req.url));
      }
      return NextResponse.next();
    }

    if (pathname.startsWith("/patient") && token?.profileComplete === false) {
      const onboardingUrl = new URL("/onboarding", req.url);
      return NextResponse.redirect(onboardingUrl);
    }

    if (pathname.startsWith("/doctor")) {
      const role = token?.role;
      const doctorApprovalStatus = token?.doctorApprovalStatus ?? null;
      const profileComplete = token?.profileComplete ?? null;

      if (role !== "DOCTOR") {
        const target = getPostLoginPath({
          role: role ?? null,
          doctorApprovalStatus,
          profileComplete,
        });
        return NextResponse.redirect(new URL(target, req.url));
      }

      if (profileComplete === false) {
        return NextResponse.redirect(new URL("/auth/signup?role=doctor", req.url));
      }

      if (doctorApprovalStatus !== "APPROVED") {
        return NextResponse.redirect(
          new URL("/auth/doctor-pending-approval", req.url),
        );
      }
    }

    if (pathname.startsWith("/admin")) {
      if (token?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/auth/signin",
    },
    callbacks: {
      // /book-appointment is a public flow — only the staff-blocking branches
      // above need a token. withAuth's default would reject anonymous users
      // here, breaking unauthenticated booking, so we authorize all requests
      // through to the handler above.
      authorized: ({ req, token }) => {
        if (req.nextUrl.pathname.startsWith("/book-appointment")) return true;
        return token != null;
      },
    },
  },
);

export const config = {
  matcher: [
    "/patient/:path*",
    "/doctor/:path*",
    "/admin/:path*",
    "/book-appointment/:path*",
  ],
};
