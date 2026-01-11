import MeetsClientPage from "../clients/meets-client-page";

type MeetRoomPageProps = {
  params: { code: string };
};

export default function MeetRoomPage({ params }: MeetRoomPageProps) {
  const rawCode = typeof params.code === "string" ? params.code : "";
  const roomCode = decodeURIComponent(rawCode);
  const resolvedRoomCode =
    roomCode === "undefined" || roomCode === "null" ? "" : roomCode;
  return (
    <MeetsClientPage
      initialRoomId={resolvedRoomCode}
      forceJoinOnly={true}
    />
  );
}
