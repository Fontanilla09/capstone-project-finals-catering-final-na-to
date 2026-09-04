<?php
session_start();

if (!isset($_SESSION['user_id']) || !in_array($_SESSION['role'], ['customer', 'caterer'], true)) {
    header('Location: ../login.php');
    exit;
}

require_once __DIR__ . '/../../backend/config.php';

$current_user_id = (int) $_SESSION['user_id'];
$caterer_id = (int) ($_GET['caterer'] ?? $_POST['caterer_id'] ?? 0);
$package_id = (int) ($_GET['package'] ?? $_POST['package_id'] ?? 0);
$customer_id = (int) ($_SESSION['customer_id'] ?? $_POST['customer_id'] ?? 0);
$customer_user_id = 0;
$caterer_user_id = 0;
$customer_name = '';
$caterer_name = '';
$error = '';
$success = '';

if ($_SESSION['role'] === 'caterer') {
    $caterer_id = (int) $_SESSION['caterer_id'];
    $customer_id = (int) ($_GET['customer'] ?? $_POST['customer_id'] ?? 0);
    $caterer_user_id = $current_user_id;
}

if ($package_id > 0 && $caterer_id > 0) {
    $package_check = $conn->prepare('SELECT id FROM packages WHERE id = ? AND caterer_id = ? LIMIT 1');
    $package_check->bind_param('ii', $package_id, $caterer_id);
    $package_check->execute();
    if (!$package_check->get_result()->fetch_assoc()) {
        $package_id = 0;
    }
    $package_check->close();
}

if ($customer_id > 0 && $caterer_id > 0) {
    $people = $conn->prepare('SELECT c.id AS customer_id, c.user_id AS customer_user_id, c.full_name AS customer_name, ca.id AS caterer_id, ca.user_id AS caterer_user_id, ca.business_name AS caterer_name FROM customers c JOIN users cu ON cu.id = c.user_id JOIN caterers ca ON ca.id = ? WHERE c.id = ?');
    $people->bind_param('ii', $caterer_id, $customer_id);
    $people->execute();
    $people_row = $people->get_result()->fetch_assoc();
    $people->close();
    if ($people_row) {
        $customer_user_id = (int) $people_row['customer_user_id'];
        $caterer_user_id = (int) $people_row['caterer_user_id'];
        $customer_name = $people_row['customer_name'];
        $caterer_name = $people_row['caterer_name'];
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $customer_user_id > 0 && $caterer_user_id > 0) {
    $message = trim($_POST['message'] ?? '');
    if ($message === '') {
        $error = 'Please enter a message.';
    } elseif (!in_array($current_user_id, [$customer_user_id, $caterer_user_id], true)) {
        $error = 'You are not part of this conversation.';
    } else {
        $sender_id = $current_user_id;
        $receiver_id = $sender_id === $customer_user_id ? $caterer_user_id : $customer_user_id;
        if ($package_id > 0) {
            $insert = $conn->prepare('INSERT INTO messages (reservation_id, package_id, sender_id, receiver_id, message) VALUES (NULL, ?, ?, ?, ?)');
            $insert->bind_param('iiis', $package_id, $sender_id, $receiver_id, $message);
        } else {
            $insert = $conn->prepare('INSERT INTO messages (reservation_id, package_id, sender_id, receiver_id, message) VALUES (NULL, NULL, ?, ?, ?)');
            $insert->bind_param('iis', $sender_id, $receiver_id, $message);
        }
        if ($insert->execute()) {
            $success = 'Message sent.';
        } else {
            $error = 'Unable to send message.';
        }
        $insert->close();
    }
}

$conversation = [];
$conversations = [];
if ($_SESSION['role'] === 'caterer' && $caterer_id > 0 && $customer_id <= 0) {
    $list = $conn->prepare('SELECT m.package_id, c.id AS customer_id, c.full_name, MAX(m.created_at) AS last_message FROM messages m JOIN customers c ON c.user_id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END WHERE (m.sender_id = ? OR m.receiver_id = ?) GROUP BY m.package_id, c.id, c.full_name ORDER BY last_message DESC');
    $list->bind_param('iii', $caterer_user_id, $caterer_user_id, $caterer_user_id);
    $list->execute();
    $conversations = $list->get_result()->fetch_all(MYSQLI_ASSOC);
    $list->close();
}
if ($customer_user_id > 0 && $caterer_user_id > 0) {
    $history = $conn->prepare('SELECT m.message, m.created_at, m.sender_id, u.email FROM messages m JOIN users u ON u.id = m.sender_id WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)) AND (? = 0 OR m.package_id = ?) ORDER BY m.created_at ASC');
    $history->bind_param('iiiiii', $customer_user_id, $caterer_user_id, $caterer_user_id, $customer_user_id, $package_id, $package_id);
    $history->execute();
    $conversation = $history->get_result()->fetch_all(MYSQLI_ASSOC);
    $history->close();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Messages - CaterAI</title>
    <style>
        body { margin:0; font-family:'Segoe UI', sans-serif; background:#f5f7ff; color:#111827; }
        .page { max-width:760px; margin:0 auto; padding:32px 20px; }
        .card { background:#fff; border-radius:16px; padding:24px; box-shadow:0 12px 30px rgba(15,23,42,.08); }
        .messages { display:grid; gap:12px; min-height:240px; max-height:460px; overflow:auto; margin:20px 0; }
        .message { max-width:75%; padding:12px 16px; border-radius:14px; background:#eef2ff; }
        .message.mine { margin-left:auto; background:#2563eb; color:#fff; }
        .message small { display:block; opacity:.7; margin-top:5px; }
        textarea { width:100%; min-height:90px; box-sizing:border-box; padding:12px; border:1px solid #dbe3f0; border-radius:10px; resize:vertical; }
        button, a { display:inline-block; padding:11px 16px; border:0; border-radius:10px; text-decoration:none; font-weight:700; cursor:pointer; }
        button { background:#2563eb; color:#fff; } a { color:#2563eb; background:#eef2ff; }
        .error { color:#991b1b; background:#fee2e2; padding:10px; border-radius:8px; } .success { color:#166534; background:#dcfce7; padding:10px; border-radius:8px; }
    </style>
</head>
<body>
    <main class="page">
        <div class="card">
            <a href="<?php echo $_SESSION['role'] === 'caterer' ? 'caterer_dashboard.php' : '../browse_packages.php'; ?>">Back</a>
            <h1><?php echo $_SESSION['role'] === 'caterer' ? 'Customer Conversation' : 'Message Caterer'; ?></h1>
            <?php if ($customer_name && $caterer_name): ?>
                <p><strong>Caterer:</strong> <?php echo htmlspecialchars($caterer_name); ?> <span style="color:#64748b;">|</span> <strong>Customer:</strong> <?php echo htmlspecialchars($customer_name); ?></p>
            <?php endif; ?>
            <?php if ($error): ?><div class="error"><?php echo htmlspecialchars($error); ?></div><?php endif; ?>
            <?php if ($success): ?><div class="success"><?php echo htmlspecialchars($success); ?></div><?php endif; ?>
            <?php if ($_SESSION['role'] === 'caterer' && $customer_id <= 0): ?>
                <h2>Customer Conversations</h2>
                <?php if (!$conversations): ?>
                    <p>No customer messages yet.</p>
                <?php else: ?>
                    <?php foreach ($conversations as $item): ?>
                        <p><a href="messages.php?customer=<?php echo intval($item['customer_id']); ?><?php echo $item['package_id'] ? '&package=' . intval($item['package_id']) : ''; ?>"> <?php echo htmlspecialchars($item['full_name']); ?> </a><small><?php echo $item['package_id'] ? 'Package #' . intval($item['package_id']) . ' | ' : 'Package not specified | '; ?>Last message: <?php echo htmlspecialchars($item['last_message']); ?></small></p>
                    <?php endforeach; ?>
                <?php endif; ?>
            <?php endif; ?>
            <div class="messages" id="message-list" data-customer="<?php echo $customer_id; ?>" data-caterer="<?php echo $caterer_id; ?>" data-package="<?php echo $package_id; ?>">
                <?php foreach ($conversation as $item): ?>
                    <div class="message<?php echo (int) $item['sender_id'] === $current_user_id ? ' mine' : ''; ?>">
                        <?php echo nl2br(htmlspecialchars($item['message'])); ?>
                        <small><?php echo htmlspecialchars($item['created_at']); ?></small>
                    </div>
                <?php endforeach; ?>
                <?php if (!$conversation): ?><p>No messages yet. Start the conversation.</p><?php endif; ?>
            </div>
            <?php if ($customer_id > 0 && $caterer_id > 0): ?>
                <form method="POST">
                    <input type="hidden" name="customer_id" value="<?php echo $customer_id; ?>">
                    <input type="hidden" name="caterer_id" value="<?php echo $caterer_id; ?>">
                    <input type="hidden" name="package_id" value="<?php echo $package_id; ?>">
                    <textarea name="message" placeholder="Write a message..." required></textarea>
                    <button type="submit">Send Message</button>
                </form>
            <?php else: ?>
                <p>Select a customer conversation to start messaging.</p>
            <?php endif; ?>
        </div>
    </main>
    <?php if ($customer_id > 0 && $caterer_id > 0): ?>
    <script>
        const messageList = document.getElementById('message-list');
        let lastMessageId = 0;

        function renderMessages(messages) {
            if (!messages.length) return;
            const wasAtBottom = messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - 30;
            messageList.innerHTML = messages.map(item => {
                const mine = Number(item.sender_id) === <?php echo $current_user_id; ?>;
                return '<div class="message' + (mine ? ' mine' : '') + '">' + escapeHtml(item.message).replace(/\n/g, '<br>') + '<small>' + escapeHtml(item.created_at) + '</small></div>';
            }).join('');
            if (wasAtBottom) messageList.scrollTop = messageList.scrollHeight;
        }

        function escapeHtml(value) {
            return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
        }

        function refreshMessages() {
            const params = new URLSearchParams({
                customer_id: messageList.dataset.customer,
                caterer_id: messageList.dataset.caterer,
                package_id: messageList.dataset.package
            });
            fetch('../../backend/messages_api.php?' + params.toString(), { cache: 'no-store' })
                .then(response => response.ok ? response.json() : null)
                .then(data => {
                    if (data && data.messages) renderMessages(data.messages);
                })
                .catch(() => {});
        }

        refreshMessages();
        setInterval(refreshMessages, 3000);
    </script>
    <?php endif; ?>
</body>
</html>