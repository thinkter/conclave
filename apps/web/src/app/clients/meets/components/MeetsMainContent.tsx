"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Socket } from "socket.io-client";
import type { RoomInfo } from "@/lib/sfu-types";
import AdminTipsOverlay from "./AdminTipsOverlay";
import ChatOverlay from "./ChatOverlay";
import ChatPanel from "./ChatPanel";
import ControlsBar from "./ControlsBar";
import GridLayout from "./GridLayout";
import JoinScreen from "./JoinScreen";
import ParticipantsPanel from "./ParticipantsPanel";
import PresentationLayout from "./PresentationLayout";
import ReactionOverlay from "./ReactionOverlay";
import type { ParticipantsPanelGetRooms } from "./ParticipantsPanel";
import type {
  ChatMessage,
  ConnectionState,
  Participant,
  ReactionEvent,
  ReactionOption,
} from "../types";

interface MeetsMainContentProps {
  isJoined: boolean;
  connectionState: ConnectionState;
  isLoading: boolean;
  roomId: string;
  setRoomId: Dispatch<SetStateAction<string>>;
  joinRoom: () => void;
  joinRoomById: (roomId: string) => void;
  enableRoomRouting: boolean;
  forceJoinOnly: boolean;
  allowGhostMode: boolean;
  user?: {
    id?: string;
    email?: string | null;
    name?: string | null;
  };
  userEmail: string;
  isAdmin: boolean;
  showPermissionHint: boolean;
  availableRooms: RoomInfo[];
  roomsStatus: "idle" | "loading" | "error";
  refreshRooms: () => void;
  displayNameInput: string;
  setDisplayNameInput: Dispatch<SetStateAction<string>>;
  ghostEnabled: boolean;
  setIsGhostMode: Dispatch<SetStateAction<boolean>>;
  presentationStream: MediaStream | null;
  presenterName: string;
  localStream: MediaStream | null;
  isCameraOff: boolean;
  isMuted: boolean;
  isHandRaised: boolean;
  participants: Map<string, Participant>;
  isMirrorCamera: boolean;
  activeSpeakerId: string | null;
  currentUserId: string;
  audioOutputDeviceId?: string;
  activeScreenShareId: string | null;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  unreadCount: number;
  reactionOptions: ReactionOption[];
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  toggleChat: () => void;
  toggleHandRaised: () => void;
  sendReaction: (reaction: ReactionOption) => void;
  leaveRoom: () => void;
  isParticipantsOpen: boolean;
  setIsParticipantsOpen: Dispatch<SetStateAction<boolean>>;
  pendingUsers: Map<string, string>;
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: Dispatch<SetStateAction<string>>;
  sendChat: (content: string) => void;
  chatOverlayMessages: ChatMessage[];
  setChatOverlayMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  socket: Socket | null;
  setPendingUsers: Dispatch<SetStateAction<Map<string, string>>>;
  showAdminTips: boolean;
  setShowAdminTips: Dispatch<SetStateAction<boolean>>;
  setHasSeenTips: Dispatch<SetStateAction<boolean>>;
  resolveDisplayName: (userId: string) => string;
  reactions: ReactionEvent[];
  getRoomsForRedirect?: ParticipantsPanelGetRooms;
  onUserChange: (user: { id: string; email: string; name: string } | null) => void;
  onIsAdminChange: (isAdmin: boolean) => void;
}

export default function MeetsMainContent({
  isJoined,
  connectionState,
  isLoading,
  roomId,
  setRoomId,
  joinRoom,
  joinRoomById,
  enableRoomRouting,
  forceJoinOnly,
  allowGhostMode,
  user,
  userEmail,
  isAdmin,
  showPermissionHint,
  availableRooms,
  roomsStatus,
  refreshRooms,
  displayNameInput,
  setDisplayNameInput,
  ghostEnabled,
  setIsGhostMode,
  presentationStream,
  presenterName,
  localStream,
  isCameraOff,
  isMuted,
  isHandRaised,
  participants,
  isMirrorCamera,
  activeSpeakerId,
  currentUserId,
  audioOutputDeviceId,
  activeScreenShareId,
  isScreenSharing,
  isChatOpen,
  unreadCount,
  reactionOptions,
  toggleMute,
  toggleCamera,
  toggleScreenShare,
  toggleChat,
  toggleHandRaised,
  sendReaction,
  leaveRoom,
  isParticipantsOpen,
  setIsParticipantsOpen,
  pendingUsers,
  chatMessages,
  chatInput,
  setChatInput,
  sendChat,
  chatOverlayMessages,
  setChatOverlayMessages,
  socket,
  setPendingUsers,
  showAdminTips,
  setShowAdminTips,
  setHasSeenTips,
  resolveDisplayName,
  reactions,
  getRoomsForRedirect,
  onUserChange,
  onIsAdminChange,
}: MeetsMainContentProps) {
  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden relative">
      {isJoined && reactions.length > 0 && (
        <ReactionOverlay
          reactions={reactions}
          getDisplayName={resolveDisplayName}
        />
      )}
      {!isJoined ? (
        <JoinScreen
          roomId={roomId}
          onRoomIdChange={setRoomId}
          onJoin={joinRoom}
          isLoading={isLoading}
          user={user}
          userEmail={userEmail}
          connectionState={connectionState}
          isAdmin={isAdmin}
          enableRoomRouting={enableRoomRouting}
          forceJoinOnly={forceJoinOnly}
          allowGhostMode={allowGhostMode}
          showPermissionHint={showPermissionHint}
          rooms={availableRooms}
          roomsStatus={roomsStatus}
          onRefreshRooms={refreshRooms}
          onJoinRoom={joinRoomById}
          displayNameInput={displayNameInput}
          onDisplayNameInputChange={setDisplayNameInput}
          isGhostMode={ghostEnabled}
          onGhostModeChange={setIsGhostMode}
          onUserChange={onUserChange}
          onIsAdminChange={onIsAdminChange}
        />
      ) : presentationStream ? (
        <PresentationLayout
          presentationStream={presentationStream}
          presenterName={presenterName}
          localStream={localStream}
          isCameraOff={isCameraOff}
          isHandRaised={isHandRaised}
          isGhost={ghostEnabled}
          participants={participants}
          userEmail={userEmail}
          isMirrorCamera={isMirrorCamera}
          activeSpeakerId={activeSpeakerId}
          currentUserId={currentUserId}
          audioOutputDeviceId={audioOutputDeviceId}
          getDisplayName={resolveDisplayName}
        />
      ) : (
        <GridLayout
          localStream={localStream}
          isCameraOff={isCameraOff}
          isMuted={isMuted}
          isHandRaised={isHandRaised}
          isGhost={ghostEnabled}
          participants={participants}
          userEmail={userEmail}
          isMirrorCamera={isMirrorCamera}
          activeSpeakerId={activeSpeakerId}
          currentUserId={currentUserId}
          audioOutputDeviceId={audioOutputDeviceId}
          getDisplayName={resolveDisplayName}
        />
      )}

      {isJoined && (
        <ControlsBar
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isScreenSharing={isScreenSharing}
          activeScreenShareId={activeScreenShareId}
          isChatOpen={isChatOpen}
          unreadCount={unreadCount}
          isHandRaised={isHandRaised}
          reactionOptions={reactionOptions}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={toggleScreenShare}
          onToggleChat={toggleChat}
          onToggleHandRaised={toggleHandRaised}
          onSendReaction={sendReaction}
          onLeave={leaveRoom}
          isAdmin={isAdmin}
          isGhostMode={ghostEnabled}
          isParticipantsOpen={isParticipantsOpen}
          onToggleParticipants={() => setIsParticipantsOpen((prev) => !prev)}
          pendingUsersCount={pendingUsers.size}
        />
      )}

      {isJoined && isChatOpen && (
        <ChatPanel
          messages={chatMessages}
          chatInput={chatInput}
          onInputChange={setChatInput}
          onSend={sendChat}
          onClose={toggleChat}
          currentUserId={currentUserId}
          isGhostMode={ghostEnabled}
        />
      )}

      {isJoined && isParticipantsOpen && isAdmin && (
        <ParticipantsPanel
          participants={participants}
          currentUserId={currentUserId}
          onClose={() => setIsParticipantsOpen(false)}
          socket={socket}
          isAdmin={isAdmin}
          pendingUsers={pendingUsers}
          roomId={roomId}
          getRooms={getRoomsForRedirect}
          getDisplayName={resolveDisplayName}
          onPendingUserStale={(staleUserId) => {
            setPendingUsers((prev) => {
              const next = new Map(prev);
              next.delete(staleUserId);
              return next;
            });
          }}
        />
      )}

      {isJoined && isAdmin && showAdminTips && (
        <AdminTipsOverlay
          currentStep={0}
          onNextStep={() => setShowAdminTips(false)}
          onSkip={() => {
            setShowAdminTips(false);
            setHasSeenTips(true);
            localStorage.setItem("admin-tips-seen", "true");
          }}
          onClose={() => setShowAdminTips(false)}
        />
      )}

      {isJoined && chatOverlayMessages.length > 0 && (
        <ChatOverlay
          messages={chatOverlayMessages}
          onDismiss={(id) =>
            setChatOverlayMessages((prev) => prev.filter((m) => m.id !== id))
          }
        />
      )}
    </div>
  );
}
