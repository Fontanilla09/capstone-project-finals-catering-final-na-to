import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { API_BASE } from "../lib/api";
import { getChatModerationError } from "../lib/chatModeration";
import { supabase } from "../lib/supabase";
import DashboardPage from "../components/DashboardPage.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";

function MessengerAvatar({ image, name, large = false }) {
  const [unavailableImage, setUnavailableImage] = useState("");

  const className = `messenger-avatar${large ? " large" : ""}`;
  if (image && unavailableImage !== image) {
    return (
      <img
        className={`${className} messenger-avatar-photo`}
        src={image}
        alt=""
        onError={() => setUnavailableImage(image)}
      />
    );
  }
  return (
    <span className={className} aria-hidden="true">
      {name?.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function getCatererPresence(lastActiveAt) {
  const timestamp = Date.parse(lastActiveAt || "");
  if (!Number.isFinite(timestamp)) {
    return { active: false, label: "Offline · last seen unavailable" };
  }

  const elapsedMinutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60000);
  if (elapsedMinutes < 5) return { active: true, label: "Active" };
  if (elapsedMinutes < 60) {
    return { active: false, label: `Offline · ${elapsedMinutes}m ago` };
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return { active: false, label: `Offline · ${elapsedHours}h ago` };
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return { active: false, label: `Offline · ${elapsedDays}d ago` };
}

export default function CustomerMessages() {
  const query = new URLSearchParams(window.location.search);
  const selectedCustomer = query.get("customer_id") || "";
  const selectedCaterer = query.get("caterer_id") || "";
  const packageId = query.get("package_id") || "0";
  const [conversations, setConversations] = useState([]);
  const [subscribedCaterers, setSubscribedCaterers] = useState([]);
  const [subscribedCaterersError, setSubscribedCaterersError] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("customer");
  const [session, setSession] = useState(null);
  const sessionUserId = useRef(null);
  const [conversationTitle, setConversationTitle] = useState("");
  const [conversationImage, setConversationImage] = useState("");
  const [showConversationList, setShowConversationList] = useState(
    !(selectedCustomer && selectedCaterer),
  );
  const customer =
    selectedCustomer ||
    (session?.role === "customer" ? session?.customer_id : "");
  const caterer =
    selectedCaterer || (session?.role === "caterer" ? session?.caterer_id : "");
  const activeConversation = conversations.find(
    (item) =>
      String(item.caterer_id || "") === String(caterer) &&
      String(item.package_id || 0) === String(packageId),
  );
  const activeDirectoryCaterer = subscribedCaterers.find(
    (item) => String(item.caterer_id) === String(caterer),
  );
  const newMessageCaterers = subscribedCaterers.filter(
    (item) =>
      !conversations.some(
        (conversation) =>
          String(conversation.caterer_id) === String(item.caterer_id),
      ),
  );
  const loadConversations = useCallback(async (currentRole) => {
    try {
      const { data, error } = await supabase.rpc("get_my_conversations");
      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      setConversations([]);
      setStatus("");
    }
    if (currentRole === "customer") {
      const { data, error } = await supabase.rpc(
        "get_customer_subscribed_caterers",
      );
      if (error) {
        console.error("Failed to load customer chat directory:", error);
        setSubscribedCaterers([]);
        setSubscribedCaterersError(
          "Caterers are temporarily unavailable.",
        );
      } else {
        setSubscribedCaterers(data || []);
        setSubscribedCaterersError("");
      }
    }
  }, []);
  async function loadMessages() {
    if (!customer || !caterer) return;
    try {
      const { data, error } = await supabase.rpc("get_my_messages", {
        message_customer_id: customer,
        message_caterer_id: caterer,
        message_package_id: packageId,
      });
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      setMessages([]);
      setStatus("");
    }
  }
  const handleSessionVerified = useCallback((verifiedSession) => {
    if (sessionUserId.current === verifiedSession.user_id) return;
    sessionUserId.current = verifiedSession.user_id;
    setSession(verifiedSession);
    setRole(verifiedSession.role || "customer");
    setStatus("");
    loadConversations(verifiedSession.role || "customer");
  }, [loadConversations]);
  useEffect(() => {
    if (!session?.authenticated || !caterer || packageId === "0") {
      setConversationTitle("");
      setConversationImage("");
      return undefined;
    }
    setConversationTitle("");
    setConversationImage("");
    let active = true;
    supabase
      .from("packages")
      .select("caterers!inner(business_name,profile_image)")
      .eq("id", packageId)
      .eq("caterer_id", caterer)
      .eq("caterers.is_verified", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data?.caterers?.business_name)
          setConversationTitle(data.caterers.business_name);
        if (!error) setConversationImage(data?.caterers?.profile_image || "");
      })
      .catch(() => {
        if (active) {
          setConversationTitle("");
          setConversationImage("");
        }
      });
    return () => {
      active = false;
    };
  }, [session, caterer, packageId]);
  useEffect(() => {
    if (!session?.authenticated || !customer || !caterer || packageId === "0")
      return undefined;
    let active = true;
    async function markSeen() {
      const { error } = await supabase.rpc("mark_my_messages_read", {
        message_customer_id: customer,
        message_caterer_id: caterer,
        message_package_id: packageId,
      });
      if (!error && active) window.dispatchEvent(new Event("messages-seen"));
    }
    markSeen();
    return () => {
      active = false;
    };
  }, [session, customer, caterer, packageId]);
  useEffect(() => {
    if (!session?.authenticated) return undefined;
    loadMessages();
    const timer = setInterval(() => {
      loadMessages();
      loadConversations(role);
    }, 2000);
    return () => clearInterval(timer);
  }, [session, customer, caterer, packageId, role, loadConversations]);
  async function send(event) {
    event.preventDefault();
    if (!text.trim() && !attachment) return;
    setStatus("");
    const moderationError = getChatModerationError(text);
    if (moderationError) {
      setStatus(moderationError);
      return;
    }
    try {
      let attachmentPath = null;
      if (attachment) {
        const path = `${session.user_id}/${crypto.randomUUID()}-${attachment.name}`;
        const { error: uploadError } = await supabase.storage
          .from("messages")
          .upload(path, attachment, { contentType: attachment.type });
        if (uploadError) throw uploadError;
        const { data: publicFile } = supabase.storage
          .from("messages")
          .getPublicUrl(path);
        attachmentPath = publicFile.publicUrl;
      }
      const { error } = await supabase.rpc("send_my_message", {
        message_customer_id: customer,
        message_caterer_id: caterer,
        message_package_id: packageId,
        message_text: text.trim(),
        message_attachment: attachmentPath,
      });
      if (error) throw error;
      setText("");
      setAttachment(null);
      const form = event.currentTarget;
      if (form && typeof form.reset === "function") {
        form.reset();
      }
      loadMessages();
    } catch (error) {
      setStatus(
        error?.message || "Message could not be sent. Please try again.",
      );
    }
  }
  const conversationName = (item) => {
    if (!item) return "New conversation";
    if (role === "caterer")
      return (
        item.full_name || item.other_name || item.other_email || "Customer"
      );
    return (
      item.business_name || item.other_name || item.other_email || "Caterer"
    );
  };
  const activeTitle = activeConversation
    ? conversationName(activeConversation)
    : activeDirectoryCaterer?.business_name ||
      conversationTitle ||
      "New conversation";
  const activeImage =
    activeConversation?.other_profile_image ||
    activeDirectoryCaterer?.profile_image ||
    conversationImage;
  const activeCatererPresence = getCatererPresence(
    activeConversation?.other_last_active_at ||
      activeDirectoryCaterer?.last_active_at,
  );
  const conversationHref = (item) =>
    `/dashboard/messages?customer_id=${item.customer_id || ""}&caterer_id=${item.caterer_id || ""}&package_id=${item.package_id || 0}`;
  return (
    <DashboardPage role={role} section="messages" onSessionVerified={handleSessionVerified}>
      {session ? <>
        {status && <p className="form-alert error-alert">{status}</p>}
        <div
          className={`messenger-shell ${showConversationList ? "mobile-conversations" : "mobile-chat"}`}
        >
          <aside className="messenger-sidebar">
            <div className="messenger-sidebar-heading">
              <h2>Messages</h2>
              <span>
                {role === "customer"
                  ? newMessageCaterers.length + conversations.length
                  : conversations.length}
              </span>
            </div>
            <div className="messenger-search">Search conversations</div>
            <div className="messenger-conversations">
              {role === "customer" && (
                <>
                  <h3 className="messenger-list-section-title">
                    Caterers
                  </h3>
                  {subscribedCaterersError ? (
                    <p className="messenger-directory-feedback" role="status">
                      {subscribedCaterersError}
                    </p>
                  ) : newMessageCaterers.length ? (
                    newMessageCaterers.map((item) => {
                      const href = `/dashboard/messages?customer_id=${customer || ""}&caterer_id=${item.caterer_id}&package_id=0`;
                      const isActive =
                        String(item.caterer_id) === String(caterer) &&
                        packageId === "0";
                      return (
                        <a
                          className={`${isActive ? "messenger-conversation active" : "messenger-conversation"}`}
                          href={href}
                          key={item.caterer_id}
                        >
                          <MessengerAvatar
                            image={item.profile_image}
                            name={item.business_name}
                          />
                          <span>
                            <strong>{item.business_name}</strong>
                            <small
                              className={`messenger-presence ${getCatererPresence(item.last_active_at).active ? "is-active" : "is-offline"}`}
                            >
                              {getCatererPresence(item.last_active_at).label}
                            </small>
                            <small>Send a message</small>
                          </span>
                        </a>
                      );
                    })
                  ) : (
                    <p className="messenger-directory-feedback">
                      No new caterers to message.
                    </p>
                  )}
                  <h3 className="messenger-list-section-title">
                    Conversations
                  </h3>
                </>
              )}
              {conversations.map((item) => {
                const isUnread = Number(item.unread_count || 0) > 0;
                const isActive =
                  String(item.caterer_id || "") === String(caterer) &&
                  String(item.package_id || 0) === String(packageId);
                return (
                  <a
                    className={`${isActive ? "messenger-conversation active" : "messenger-conversation"}${isUnread ? " unread" : ""}`}
                    href={conversationHref(item)}
                    key={`${item.other_user_id}-${item.package_id}`}
                  >
                    <MessengerAvatar
                      image={item.other_profile_image}
                      name={conversationName(item)}
                    />
                    <span>
                      <strong>{conversationName(item)}</strong>
                      <small>
                        {item.last_message_text ||
                          (item.package_id
                            ? `Package #${item.package_id}`
                            : "No messages yet")}
                      </small>
                      {role === "customer" && (
                        <small
                          className={`messenger-presence ${getCatererPresence(item.other_last_active_at).active ? "is-active" : "is-offline"}`}
                        >
                          {getCatererPresence(item.other_last_active_at).label}
                        </small>
                      )}
                    </span>
                    {isUnread && (
                      <b className="conversation-unread-count">
                        {item.unread_count > 99 ? "99+" : item.unread_count}
                      </b>
                    )}
                  </a>
                );
              })}
              {role === "customer" && !conversations.length && (
                <p className="messenger-directory-feedback">
                  No conversations yet.
                </p>
              )}
            </div>
            {role === "caterer" && !conversations.length && (
              <p className="messenger-empty">No conversations yet.</p>
            )}
          </aside>
          <section className="messenger-chat">
            <header className="messenger-chat-header">
              <button
                className="messenger-back-button"
                type="button"
                aria-label="Back to conversations"
                onClick={() => setShowConversationList(true)}
              >
                ←
              </button>
              <MessengerAvatar
                image={activeImage}
                name={activeTitle}
                large
              />
              <div className="messenger-chat-identity">
                <h3>{activeTitle}</h3>
                <small>
                  {packageId !== "0"
                    ? `Package #${packageId}`
                    : "CaterAI messages"}
                </small>
              </div>
              {role === "customer" ? (
                <span
                  className={`online-dot ${activeCatererPresence.active ? "is-active" : "is-offline"}`}
                >
                  {activeCatererPresence.label}
                </span>
              ) : (
                <span className="online-dot">Live</span>
              )}
            </header>
            {customer && caterer ? (
              <>
                <div className="messenger-messages">
                  {messages.length ? (
                    messages.map((item) => (
                      <div
                        className={
                          Number(item.sender_id) === Number(session?.user_id)
                            ? "chat-bubble-row mine"
                            : "chat-bubble-row"
                        }
                        key={item.id}
                      >
                        {Number(item.sender_id) !== Number(session?.user_id) && (
                          <MessengerAvatar
                            image={activeImage}
                            name={activeTitle}
                          />
                        )}
                        <div className="chat-bubble">
                          {item.message && <span>{item.message}</span>}
                          {item.attachment && (
                            <img
                              className="chat-attachment"
                              src={`${API_BASE}${item.attachment}`}
                              alt="Chat attachment"
                            />
                          )}
                          <small>{item.created_at}</small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="chat-start">
                      <strong>Start the conversation</strong>
                      <span>
                        Ask the caterer about this package or your event.
                      </span>
                    </div>
                  )}
                </div>
                <form className="messenger-composer" onSubmit={send}>
                  <label
                    className="chat-attachment-button"
                    title="Attach photo"
                  >
                    ＋
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        setAttachment(event.target.files?.[0] || null)
                      }
                    />
                  </label>
                  {attachment && (
                    <span className="attachment-name">{attachment.name}</span>
                  )}
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Ask about the package or your event..."
                    rows="1"
                    maxLength={2000}
                    aria-label="Message"
                  />
                  <button
                    className="send-message-button"
                    type="submit"
                    aria-label="Send message"
                  >
                    <Send size={18} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </form>
              </>
            ) : (
              <div className="chat-start">
                <strong>Select a conversation</strong>
                <span>
                  Choose a conversation or open a package message link.
                </span>
              </div>
            )}
          </section>
        </div>
      </> : <LoadingSpinner compact />}
    </DashboardPage>
  );
}
