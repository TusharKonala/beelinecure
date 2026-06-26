-- Add FAILED status for booking sessions where payment succeeded but slot was taken.
ALTER TYPE "BookingSessionStatus" ADD VALUE 'FAILED';
