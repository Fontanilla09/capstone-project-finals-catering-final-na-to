import { useEffect, useState } from "react";
import { API_BASE } from "../lib/api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import DashboardPage from "../components/DashboardPage.jsx";

export default function CustomerMessages() {
  const query = new URLSearchParams(window.location.search);
  const selectedCustomer = query.get("customer_id") || "";
  const selectedCaterer = query.get("caterer_id") || "";
  const packageId = query.get("package_id") || "0";
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("customer");
  const [session, setSession] = useState(null);
  const [conversationTitle, setConversationTitle] = useState("");
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
  async function loadConversations() {
    try {
      const { data, error } = await supabase.rpc("get_my_conversations");
      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      setConversations([]);
      setStatus("");
    }
  }
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
  useEffect(() => {
    let active = true;

    const initializeSession = async () => {
      if (!isSupabaseConfigured) {
        if (active) window.location.href = "/login";
        return;
      }

      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();
        if (authError || !authData.user) {
          if (active) window.location.href = "/login";
          return;
        }

        const { data: profiles, error: profileError } =
          await supabase.rpc("get_my_profile");
        const profile = profiles?.[0];

        if (profileError || !profile) {
          if (active) window.location.href = "/login";
          return;
        }

        const nextSession = {
          authenticated: true,
          role: profile.role,
          user_id: profile.user_id,
          customer_id: profile.customer_id,
          caterer_id: profile.caterer_id,
          email: authData.user.email,
          name: profile.display_name,
        };

        if (!active) return;
        setSession(nextSession);
        setRole(profile.role || "customer");
        setStatus("");
        loadConversations();
      } catch {
        if (active) window.location.href = "/login";
      }
    };

    initializeSession();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!session?.authenticated || !caterer || packageId === "0") {
      setConversationTitle("");
      return undefined;
    }
    let active = true;
    supabase
      .from("packages")
      .select("caterers!inner(business_name)")
      .eq("id", packageId)
      .eq("caterer_id", caterer)
      .eq("caterers.is_verified", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data?.caterers?.business_name)
          setConversationTitle(data.caterers.business_name);
      })
      .catch(() => {
        if (active) setConversationTitle("");
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
      loadConversations();
    }, 2000);
    return () => clearInterval(timer);
  }, [session, customer, caterer, packageId]);
  async function send(event) {
    event.preventDefault();
    if (!text.trim() && !attachment) return;
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
      setStatus("");
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
    : conversationTitle || "New conversation";
  const conversationHref = (item) =>
    `/dashboard/messages?customer_id=${item.customer_id || ""}&caterer_id=${item.caterer_id || ""}&package_id=${item.package_id || 0}`;
  if (!session)
    return (
      <main className="packages-page">
        <p className="package-empty">Checking your session...</p>
      </main>
    );
  return (
    <DashboardPage role={role} section="messages">
      <>
        {status && <p className="form-alert error-alert">{status}</p>}
        <div className="messenger-shell">
          <aside className="messenger-sidebar">
            <div className="messenger-sidebar-heading">
              <h2>Messages</h2>
              <span>{conversations.length}</span>
            </div>
            <div className="messenger-search">Search conversations</div>
            <div className="messenger-conversations">
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
                    <span className="messenger-avatar">
                      {conversationName(item)?.charAt(0).toUpperCase() || "?"}
                    </span>
                    <span>
                      <strong>{conversationName(item)}</strong>
                      <small>
                        {item.last_message_text ||
                          (item.package_id
                            ? `Package #${item.package_id}`
                            : "No messages yet")}
                      </small>
                    </span>
                    {isUnread && (
                      <b className="conversation-unread-count">
                        {item.unread_count > 99 ? "99+" : item.unread_count}
                      </b>
                    )}
                  </a>
                );
              })}
            </div>
            {!conversations.length && (
              <p className="messenger-empty">No conversations yet.</p>
            )}
          </aside>
          <section className="messenger-chat">
            <header className="messenger-chat-header">
              <span className="messenger-avatar large">
                {activeTitle?.charAt(0).toUpperCase() || "?"}
              </span>
              <div>
                <h3>{activeTitle}</h3>
                <small>
                  {packageId !== "0"
                    ? `Package #${packageId}`
                    : "CaterAI messages"}
                </small>
              </div>
              <span className="online-dot">Live</span>
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
                    placeholder="Type a message..."
                    rows="1"
                  />
                  <button
                    className="send-message-button"
                    type="submit"
                    aria-label="Send message"
                  >
                    ↗
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
      </>
    </DashboardPage>
  );
}
