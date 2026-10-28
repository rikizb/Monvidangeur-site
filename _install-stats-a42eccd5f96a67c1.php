<?php
/**
 * Installateur unique de Matomo pour stats.monvidangeur.fr (Mon Vidangeur, v4.4).
 * A supprimer du dépôt juste après usage (commit de retrait préparé).
 *
 * Appel : POST https://monvidangeur.fr/<ce fichier>  avec le champ « token ».
 * Sans jeton valide : 404. Le jeton n'est pas dans le dépôt, seule son empreinte SHA-256 l'est.
 * Effet : télécharge Matomo (version figée, SHA-256 vérifié), l'extrait dans ../matomo-stats,
 *         écrit robots.txt et .htaccess (noindex), puis supprime ce fichier. Réponse JSON.
 */
declare(strict_types=1);

const TOKEN_SHA256    = '9495e0111eab4b85ad75265382f46b70719540ace80c3995209310ab64525f20';
const MATOMO_VERSION  = '5.14.2';
const MATOMO_URL      = 'https://builds.matomo.org/matomo-5.14.2.zip';
// SHA-256 du zip officiel, calculé le 28/10/2026 sur un fichier dont la signature GPG Matomo
// (clé F529 A270 0847 7483 777F C23D 63BB 30D0 E5D2 C749) a été vérifiée.
const MATOMO_SHA256   = 'd6ce9e2083f688741ecdccd9f13ca54761fc47592bd8926f1e2d3bcf45daeffb';
const MATOMO_SIZE     = 28157744;
const TARGET_DIRNAME  = 'matomo-stats';

function not_found(): void
{
    http_response_code(404);
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store');
    $page = __DIR__ . '/404.html';
    if (is_file($page)) {
        readfile($page);
    }
    exit;
}

function respond(int $code, array $data): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), "\n";
    exit;
}

function self_delete(): bool
{
    clearstatcache();
    return @unlink(__FILE__) || !file_exists(__FILE__);
}

function rrmdir(string $dir): void
{
    if (!is_dir($dir) || is_link($dir)) {
        @unlink($dir);
        return;
    }
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $f) {
        $f->isDir() && !$f->isLink() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
    @rmdir($dir);
}

function fail(string $step, string $message, array $cleanup = [], int $code = 500): void
{
    foreach ($cleanup as $p) {
        rrmdir($p);
    }
    respond($code, ['status' => 'error', 'step' => $step, 'message' => $message, 'self_deleted' => false]);
}

// ---------------------------------------------------------------- 1. Accès
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    not_found();
}
$token = $_POST['token'] ?? '';
if (!is_string($token) || $token === '' || strlen($token) > 256
    || !hash_equals(TOKEN_SHA256, hash('sha256', $token))) {
    not_found();
}

@set_time_limit(600);
ignore_user_abort(true);

// ---------------------------------------------------------------- 2. Cible et idempotence
$root = dirname(__DIR__);                       // racine de l'hébergement (parent de www)
$target = $root . DIRECTORY_SEPARATOR . TARGET_DIRNAME;
$www = realpath(__DIR__);

if (!is_dir($target) && !@mkdir($target, 0755)) {
    fail('target', 'Impossible de créer ../' . TARGET_DIRNAME);
}
$targetReal = realpath($target);
if ($targetReal === false || is_link($target)
    || strpos($targetReal . DIRECTORY_SEPARATOR, $www . DIRECTORY_SEPARATOR) === 0) {
    fail('target', 'Dossier cible invalide (lien ou situé dans www).');
}
if (file_exists($targetReal . '/index.php')) {
    $deleted = self_delete();
    respond(409, [
        'status' => 'already_installed',
        'message' => '../' . TARGET_DIRNAME . '/index.php existe déjà : rien n\'a été modifié.',
        'self_deleted' => $deleted,
    ]);
}
if (!is_writable($targetReal) || !is_writable($root)) {
    fail('target', 'Droits d\'écriture insuffisants sur la racine ou sur ../' . TARGET_DIRNAME);
}

// Un seul passage à la fois.
$lock = @fopen($root . '/.matomo-install.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    respond(423, ['status' => 'locked', 'message' => 'Installation déjà en cours.', 'self_deleted' => false]);
}

// ---------------------------------------------------------------- 3. Prérequis
if (!class_exists('ZipArchive')) {
    fail('requirements', 'Extension PHP « zip » (ZipArchive) absente : activez-la ou changez de version PHP dans .ovhconfig.');
}
if (!function_exists('curl_init') && !filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
    fail('requirements', 'Ni cURL ni allow_url_fopen : téléchargement impossible.');
}

// ---------------------------------------------------------------- 4. Téléchargement
$rand = bin2hex(random_bytes(6));
$zipPath = $root . '/.matomo-dl-' . $rand . '.zip';
$staging = $root . '/.matomo-extract-' . $rand;

if (function_exists('curl_init')) {
    $fh = fopen($zipPath, 'wb');
    if ($fh === false) {
        fail('download', 'Impossible de créer le fichier temporaire.');
    }
    $ch = curl_init(MATOMO_URL);
    $opts = [
        CURLOPT_FILE => $fh,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => 300,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_FAILONERROR => true,
        CURLOPT_USERAGENT => 'MonVidangeur-installer/1.0',
    ];
    if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
        $opts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS;
        $opts[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTPS;
    }
    curl_setopt_array($ch, $opts);
    $ok = curl_exec($ch);
    $err = curl_error($ch);
    fclose($fh);
    if ($ok !== true) {
        @unlink($zipPath);
        fail('download', 'Échec du téléchargement : ' . $err);
    }
} else {
    $ctx = stream_context_create([
        'http' => ['timeout' => 300, 'follow_location' => 1, 'max_redirects' => 3, 'user_agent' => 'MonVidangeur-installer/1.0'],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $in = @fopen(MATOMO_URL, 'rb', false, $ctx);
    $out = @fopen($zipPath, 'wb');
    if ($in === false || $out === false || stream_copy_to_stream($in, $out) === false) {
        @unlink($zipPath);
        fail('download', 'Échec du téléchargement (allow_url_fopen).');
    }
    fclose($in);
    fclose($out);
}

// ---------------------------------------------------------------- 5. Vérification
clearstatcache();
$size = filesize($zipPath);
$sha = hash_file('sha256', $zipPath);
if ($size !== MATOMO_SIZE || !hash_equals(MATOMO_SHA256, (string) $sha)) {
    @unlink($zipPath);
    fail('verify', 'Archive non conforme (taille ' . $size . ', SHA-256 ' . $sha . ').');
}

// ---------------------------------------------------------------- 6. Extraction (dans un dossier temporaire)
$zip = new ZipArchive();
if ($zip->open($zipPath) !== true) {
    @unlink($zipPath);
    fail('extract', 'Archive illisible.');
}
$entries = [];
for ($i = 0; $i < $zip->numFiles; $i++) {
    $name = (string) $zip->getNameIndex($i);
    if ($name === '' || $name[0] === '/' || strpos($name, '\\') !== false || strpos($name, "\0") !== false
        || preg_match('#(^|/)\.\.(/|$)#', $name)) {
        $zip->close();
        @unlink($zipPath);
        fail('extract', 'Entrée suspecte dans l\'archive : ' . $name);
    }
    if (strpos($name, 'matomo/') === 0) {          // on ignore « How to install Matomo.html » à la racine du zip
        $entries[] = $name;
    }
}
if (!in_array('matomo/index.php', $entries, true) || !in_array('matomo/matomo.js', $entries, true)) {
    $zip->close();
    @unlink($zipPath);
    fail('extract', 'Structure inattendue : matomo/index.php ou matomo/matomo.js manquant.');
}
if (!@mkdir($staging, 0755) || !$zip->extractTo($staging, $entries)) {
    $zip->close();
    @unlink($zipPath);
    fail('extract', 'Échec de l\'extraction.', [$staging]);
}
$zip->close();
@unlink($zipPath);

// ---------------------------------------------------------------- 7. Mise en place : contenu de matomo/ à la racine de matomo-stats
$src = $staging . '/matomo';
$children = array_values(array_diff(scandir($src) ?: [], ['.', '..']));
$collisions = [];
foreach ($children as $c) {
    if (file_exists($targetReal . '/' . $c)) {
        $collisions[] = $c;
    }
}
if ($collisions) {
    fail('install', 'Fichiers déjà présents dans ../' . TARGET_DIRNAME . ' : ' . implode(', ', $collisions) . ' (rien n\'a été modifié).', [$staging], 409);
}
$moved = [];
foreach ($children as $c) {
    if (!@rename($src . '/' . $c, $targetReal . '/' . $c)) {
        foreach ($moved as $m) {                     // retour arrière
            @rename($targetReal . '/' . $m, $src . '/' . $m);
        }
        fail('install', 'Déplacement impossible : ' . $c . ' (retour arrière effectué).', [$staging]);
    }
    $moved[] = $c;
}
rrmdir($staging);

// ---------------------------------------------------------------- 8. noindex, HTTPS et verrou temporaire de l'assistant
// Tant que l'assistant web de Matomo n'est pas terminé, quiconque l'atteint pourrait le finir à notre place.
// Verrou : pendant 48 h, seules les requêtes portant l'en-tête X-MV-Install (dérivé du jeton, jamais écrit
// dans le dépôt) passent. Le bloc expire seul : rien à retirer ensuite (pas de FTP/SSH nécessaire).
$gateKey = hash_hmac('sha256', 'matomo-install-gate', $token);
$gateUntil = date('YmdHis', time() + 48 * 3600);    // %{TIME} d'Apache : heure locale du serveur, AAAAMMJJhhmmss
$robots = "User-agent: *\nDisallow: /\n";
$htaccess = "# stats.monvidangeur.fr : jamais indexé, jamais listé, HTTPS seulement.\n"
    . "Options -Indexes\n"
    . "<IfModule mod_headers.c>\n"
    . "Header always set X-Robots-Tag \"noindex, nofollow\"\n"
    . "</IfModule>\n\n"
    . "# Verrou d'installation posé le " . date('Y-m-d H:i:s T') . ", expire seul le " . date('Y-m-d H:i:s T', time() + 48 * 3600) . ".\n"
    . "<If \"%{TIME} < '" . $gateUntil . "' && %{HTTP:X-MV-Install} != '" . $gateKey . "' && ! (%{REQUEST_URI} =~ m#^/\\.well-known/#)\">\n"
    . "Require all denied\n"
    . "</If>\n\n"
    . "# http -> https (même détection que le site : TLS terminé en amont chez OVH).\n"
    . "<IfModule mod_rewrite.c>\n"
    . "RewriteEngine On\n"
    . "RewriteRule ^\\.well-known/acme-challenge/ - [L]\n"
    . "RewriteCond %{HTTPS} !=on\n"
    . "RewriteCond %{ENV:HTTPS} !=on\n"
    . "RewriteCond %{HTTP:X-Forwarded-Proto} !^https\$ [NC]\n"
    . "RewriteCond %{SERVER_PORT} !=443\n"
    . "RewriteRule ^ https://stats.monvidangeur.fr%{REQUEST_URI} [R=301,L]\n"
    . "</IfModule>\n";
$w1 = file_put_contents($targetReal . '/robots.txt', $robots, LOCK_EX);
$w2 = file_exists($targetReal . '/.htaccess') ? false : file_put_contents($targetReal . '/.htaccess', $htaccess, LOCK_EX);

flock($lock, LOCK_UN);
fclose($lock);
@unlink($root . '/.matomo-install.lock');

// ---------------------------------------------------------------- 9. Fin
$deleted = self_delete();
respond(200, [
    'status' => 'ok',
    'matomo_version' => MATOMO_VERSION,
    'sha256' => $sha,
    'entries_extracted' => count($entries),
    'top_level_moved' => count($moved),
    'target' => '../' . TARGET_DIRNAME,
    'robots_txt' => $w1 !== false,
    'htaccess' => $w2 !== false,
    'install_gate_until' => $gateUntil,
    'self_deleted' => $deleted,
    'next' => 'Assistant web : https://stats.monvidangeur.fr/ (script matomo-install-curl.sh)',
]);
