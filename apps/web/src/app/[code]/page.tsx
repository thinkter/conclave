import MeetsClientPage from "../clients/meets-client-page";

type MeetRoomPageProps = {
  params: { code: string };
};

export default function MeetRoomPage({ params }: MeetRoomPageProps) {
  const rawCode = typeof params.code === "string" ? params.code : "";
  const roomCode = decodeURIComponent(rawCode);
  const resolvedRoomCode =
    roomCode === "undefined" || roomCode === "null" ? "" : roomCode;
  const sanitizedRoomCode = resolvedRoomCode
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 4);
  return (
    <MeetsClientPage
      initialRoomId={sanitizedRoomCode}
      forceJoinOnly={true}
    />
  );
}
