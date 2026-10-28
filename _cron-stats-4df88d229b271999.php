<?php
/**
 * Écriture unique du script d'archivage Matomo (../matomo-stats/archive-cron.php) pour la tâche cron OVH.
 * POST avec le champ « token » (empreinte SHA-256 seule ici). Sans jeton valide : 404. Se supprime après usage.
 */
declare(strict_types=1);
const TOKEN_SHA256 = '9495e0111eab4b85ad75265382f46b70719540ace80c3995209310ab64525f20';
function nf(): void { http_response_code(404); header('Cache-Control: no-store'); if (is_file(__DIR__ . '/404.html')) { readfile(__DIR__ . '/404.html'); } exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { nf(); }
$t = (string) ($_POST['token'] ?? '');
if ($t === '' || !hash_equals(TOKEN_SHA256, hash('sha256', $t))) { nf(); }
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
$dir = realpath(__DIR__ . '/../matomo-stats');
$out = ['status' => 'error'];
if ($dir === false || !is_file($dir . '/console')) {
    $out['message'] = 'matomo-stats/console introuvable';
} else {
    $code = "<?php\n"
        . "// Tâche cron OVH (horaire) : archivage des rapports Matomo. Refuse tout appel web.\n"
        . "if (isset(\$_SERVER['REMOTE_ADDR']) || isset(\$_SERVER['REQUEST_METHOD'])) { http_response_code(404); exit; }\n"
        . "\$_SERVER['argv'] = \$argv = [__DIR__ . '/console', 'core:archive', '--url=https://stats.monvidangeur.fr/'];\n"
        . "\$_SERVER['argc'] = \$argc = 3;\n"
        . "require __DIR__ . '/console';\n";
    $ok = file_put_contents($dir . '/archive-cron.php', $code, LOCK_EX);
    $out = ['status' => $ok ? 'ok' : 'error', 'written' => $ok !== false, 'php' => PHP_VERSION];
}
$out['self_deleted'] = @unlink(__FILE__) || !file_exists(__FILE__);
echo json_encode($out), "\n";
