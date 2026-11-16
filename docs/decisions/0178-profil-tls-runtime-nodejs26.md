# 0178 — Barrière de sortie sur le runtime `nodejs26.x` de Vercel : le profil TLS `commercial-2025`, admis si le fichier est exactement celui, audité, du runtime Lambda, avec la seule option de chiffrement que ce runtime ajoute

Statut : **proposée par le rôle `backend`** (ticket #1141, à la demande de Samuel, qui ne peut plus rien lancer sur le site d'essai). La décision est **déléguée au Tech Lead** (architecture, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`) : elle n'est la sienne qu'à sa validation de la PR. **L'admission de la section 4 n'est effective qu'après l'avis de la Sécurité** (0055 S-1 point 4 : une garde toujours fermée n'est pas corrigée par l'assouplissement d'une condition sans nouvel avis ; même forme que 0058, 0062 et 0065). La section 5 est une analyse de l'auteur, **pas** un avis de la Sécurité ; cet avis est rendu à la revue de la PR, qui ne peut pas être fusionnée sans lui. À lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Aucune dépense, aucun compte externe, aucune donnée personnelle, aucun réglage Vercel, aucun secret.

Date : 2026-11-16 · Auteur : backend · Décideur : Tech Lead (à la revue) · Avis de la Sécurité : à rendre (section 5) · Ticket #1141 · `main` relu : `cdfa2db` · Complète 0065 (section 4, second contenu audité) et 0062 (règle des options TLS, section 4 point 2 : une exception, bornée).

## 1. Constat

Journal du déploiement `dpl_BmyZpUWNkEN4bi5gGUmt9cTqR9Gj` (branche `p0-reel`, runtime `nodejs26.x`), relevé le 2026-11-16 et recopié dans le ticket #1141 :

```
{"event":"p0.guard_closed","guard":"tls_env_refused","cause":"OPENSSL_CONF","openssl_conf_zone":"var_runtime","openssl_conf_verdict":"section_nodejs","openssl_conf_directives":"activate,alg_section,autre,cipherstring,ciphersuites,groups_autres,nodejs_conf,openssl_conf,providers,signaturealgorithms,ssl_conf,system_default"}
[tls-profile] applied 'commercial/2025' -> /var/runtime/tls-profiles/commercial-2025.conf
```

Ce que ces codes disent, par le code de `src/server/env/openssl-conf.ts` :

- le fichier passe les conditions 1.1, 1.2, 1.7, 1.3, 1.4 et 1.6 de 0062 § 4 ; il nomme `nodejs_conf` ; il **n'est pas** le fichier de 505 octets audité par 0065 (sinon le verdict serait `contenu_audite`). Le runtime a changé : `nodejs26.x` au lieu de `nodejs24.x`, et un autre fichier ;
- chaque jeton rendu était, pris seul, un motif de refus selon le tableau de 0065 § 3 : `providers`, `alg_section` et `activate` (« remplace ou ajoute des implémentations cryptographiques »), `cipherstring` et `ciphersuites` (« non jugeable sans la valeur : peut abaisser le niveau de sécurité »), `signaturealgorithms` (« peut admettre SHA-1 »), `groups_autres` (une valeur de `Groups` hors de la liste fermée de 13 noms, ou d'une autre forme), `autre` (au moins une clé hors de la liste fermée). `nodejs_conf`, `openssl_conf`, `ssl_conf` et `system_default` sont la charpente du fichier ;
- **les jetons seuls ne permettent pas de conclure** : ils nomment des directives, pas leurs valeurs, et `autre` ne nomme rien. Admettre sur cette base aurait été deviner.

## 2. Ce que contient le fichier : établi et supposé

Sources lues par l'auteur le 2026-11-16 vers 09:30 UTC. La voie est celle de 0065 § 2 : l'image publique du runtime Lambda.

**Établi (fichiers téléchargés et relus) :**

1. **Image publique du runtime Lambda `nodejs26.x`** ([`Dockerfile.nodejs26.x`](https://raw.githubusercontent.com/aws/aws-lambda-base-images/nodejs26.x/Dockerfile.nodejs26.x), branche `nodejs26.x` d'`aws/aws-lambda-base-images`, six couches `ADD`). La couche `x86_64/e5336ef794b4283239094b3f0e4f93b0434d9f0fab3817be27f6e4d3b8240d82.tar.xz` (15 283 644 octets) contient :
   - `var/runtime/runtime-release` : `NAME=Node.js`, `VERSION=26.13.1-6af4e1d0` ;
   - `var/runtime/bootstrap`, qui ne pose plus `OPENSSL_CONF` lui-même (le bloc de 0065 § 2 a disparu) mais exécute `source /var/runtime/resolve-tls-profile.sh`, puis `exec /var/lang/bin/node --expose-gc --max-http-header-size 81920 …` sans option `--openssl-*` ni `--tls-*` sur la ligne de commande ;
   - `var/runtime/resolve-tls-profile.sh` (SHA-256 `b414e2a847687cd04c448f35bc0f834b3c78432e3e9bf3c1980b85b3cff671ed`). Si `AWS_LAMBDA_TLS_PROFILE` est posée, il la résout par `tls-profiles/profiles.map` ; si ni `OPENSSL_CONF` ni une option `--openssl-config`, `--tls-cipher-list`, `--tls-min-v1…`, `--tls-max-v1…` n'est déjà posée par le client, il fait, dans cet ordre : `export OPENSSL_CONF=<fichier du profil>`, `export NODE_OPTIONS="<NODE_OPTIONS existante> <options du profil>"`, puis écrit `[tls-profile] applied '<profil>' -> <fichier>`. **C'est mot pour mot la ligne du journal du ticket.** Les « options du profil » (fonction `tls_profile_node_options`) sont : `--tls-cipher-list=` suivi de la valeur de `CipherString`, de `:` et de la valeur de `Ciphersuites` ; `--tls-min-v…` et `--tls-max-v…` seulement si les bornes du profil diffèrent de `TLSv1.2` et `TLSv1.3`. Le script le dit lui-même : « Node ignores the ciphers and protocol bounds in OPENSSL_CONF, so they are passed as node options » ;
   - `var/runtime/tls-profiles/profiles.map` : `commercial/2025` et toutes les partitions (`aws`, `aws-cn`, …) mènent à `commercial-2025` ; deux autres profils existent (`commercial-2026`, `cnsa-1.0`), **non audités ici** ;
   - `var/runtime/tls-profiles/commercial-2025.conf`, **1370 octets**, ASCII, fins de ligne `\n`, SHA-256 `e8bdc8a280cfe1bad166d268112faeda61b0143316f5b261c750f22f520196a2`. Hors commentaires, en entier :

     ```ini
     openssl_conf = openssl_init
     nodejs_conf = openssl_init
     config_diagnostics = 1

     [openssl_init]
     providers = provider_sect
     ssl_conf = ssl_module
     alg_section = evp_properties

     [evp_properties]

     [provider_sect]
     default = default_sect

     [default_sect]
     activate = 1

     [ssl_module]
     system_default = crypto_policy

     [crypto_policy]
     CipherString = @SECLEVEL=2:kEECDH:kRSA:kEDH:kPSK:kDHEPSK:kECDHEPSK:kRSAPSK:-aDSS:-3DES:!DES:!RC4:!RC2:!IDEA:-SEED:!eNULL:!aNULL:!MD5:-SHA384:-CAMELLIA:-ARIA:-AESCCM8
     Ciphersuites = TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:TLS_AES_128_CCM_SHA256
     TLS.MinProtocol = TLSv1.2
     TLS.MaxProtocol = TLSv1.3
     DTLS.MinProtocol = DTLSv1.2
     DTLS.MaxProtocol = DTLSv1.2
     SignatureAlgorithms = ECDSA+SHA256:ECDSA+SHA384:ECDSA+SHA512:ed25519:ed448:rsa_pss_pss_sha256:rsa_pss_pss_sha384:rsa_pss_pss_sha512:rsa_pss_rsae_sha256:rsa_pss_rsae_sha384:rsa_pss_rsae_sha512:RSA+SHA256:RSA+SHA384:RSA+SHA512:ECDSA+SHA224:RSA+SHA224
     Groups = *X25519:secp256r1:X448:secp521r1:secp384r1:ffdhe2048:ffdhe3072:ffdhe4096:ffdhe6144:ffdhe8192
     ```

     Le fichier entier, commentaires compris, est la constante `CONTENU_OPENSSL_AUDITE_LAMBDA_NODEJS26_COMMERCIAL_2025` de `src/server/env/openssl-conf.ts` ; son test en vérifie la taille et le SHA-256.

2. **Les jetons concordent.** `directivesOpensslConf` appliquée à ces 1370 octets rend **exactement** la chaîne du journal (test « ses jetons sont exactement ceux du journal du 2026-11-16 »). `autre` vient de `config_diagnostics`, `default`, `TLS.MinProtocol`, `TLS.MaxProtocol`, `DTLS.MinProtocol` et `DTLS.MaxProtocol` ; `groups_autres` vient du préfixe `*` de `*X25519`.
3. **Node 26 lit toujours la seule section `nodejs_conf`** ([`doc/api/crypto.md`](https://github.com/nodejs/node/blob/v26.x/doc/api/crypto.md) et [`doc/api/cli.md`](https://github.com/nodejs/node/blob/v26.x/doc/api/cli.md), branche `v26.x` : « By default, Node.js reads the `nodejs_conf` section » ; [`src/node.cc`](https://github.com/nodejs/node/blob/v26.x/src/node.cc) : `SafeGetenv("OPENSSL_CONF", …)`, `OPENSSL_INIT_set_config_appname(settings, conf_section_name)`, drapeau `CONF_MFLAGS_IGNORE_MISSING_FILE` seul). La règle de 0062 § 3.2 tient pour Node 26, et la condition 1.7 a passé au runtime (le verdict relevé vient après elle). Node 26 embarque OpenSSL 3.5.9 ([`deps/openssl/openssl/VERSION.dat`](https://github.com/nodejs/node/blob/v26.x/deps/openssl/openssl/VERSION.dat), `v26.x`).

**Supposé, non établi :**

4. Que le fichier lu au runtime de **Vercel** soit **octet pour octet** celui de l'image publique, et que `NODE_OPTIONS` y contienne l'option de chiffrement sous la graphie exacte du script. Indices concordants : le chemin et la ligne `[tls-profile] applied` du journal sont ceux du script public ; les jetons sont ceux du fichier public (point 2). Non établis : la version du runtime servie par Vercel, et ce que Vercel ajoute lui-même à `NODE_OPTIONS`. **La décision ne repose pas sur cette supposition** : elle n'admet que le contenu audité à l'octet près et l'option à la graphie près (section 4), et le journal suivant dit sans valeur ce qui diffère (section 7).

## 3. Chaque directive du fichier : pourquoi elle n'affaiblit ni la vérification des certificats ni la destination de la sortie

Critère : celui de 0065 § 3 (authentification du serveur : chaîne, autorités, nom ; confidentialité de la session face à un attaquant d'aujourd'hui). Aucune directive d'un fichier OpenSSL ne change la **destination** d'une connexion (pas de proxy, pas de résolution de nom) : la destination reste gardée par le contrôle de proxy de la barrière, inchangé.

| Directive du fichier audité | Ce qu'elle fait | Jugement |
| --- | --- | --- |
| `openssl_conf = openssl_init` | Section lue par OpenSSL hors de Node ; Node ne la lit qu'avec `--openssl-shared-config`, qui reste refusée | Sans effet dans Node |
| `nodejs_conf = openssl_init` | Désigne la section que Node charge | Charpente |
| `config_diagnostics = 1` | Une erreur de configuration devient fatale au lieu d'être ignorée ([`config(5)`](https://github.com/openssl/openssl/blob/openssl-3.5/doc/man5/config.pod)) | Resserre |
| `providers` → `default`, `activate = 1` | Active le fournisseur `default`, celui qu'OpenSSL charge sans configuration. Ni `legacy`, ni `fips`, ni tiers ; aucune clé `module` (aucun chemin de bibliothèque) | Neutre |
| `alg_section = evp_properties`, section vide | Aucune propriété d'algorithme par défaut (`default_properties` absent) | Neutre |
| `ssl_conf` → `system_default` | Applique la section `crypto_policy` à chaque `SSL_CTX` | Charpente |
| `CipherString`, `Ciphersuites` | Liste des suites. **Node la remplace sur chaque contexte** par sa propre liste ; c'est pourquoi le runtime la passe aussi par `--tls-cipher-list` (ci-dessous) | Voir l'option |
| `TLS.MinProtocol = TLSv1.2`, `TLS.MaxProtocol = TLSv1.3` | Bornes égales aux défauts de Node (`tls.DEFAULT_MIN_VERSION`, `tls.DEFAULT_MAX_VERSION`), que Node pose lui-même sur chaque contexte | Neutre |
| `DTLS.MinProtocol`, `DTLS.MaxProtocol` | DTLS : aucun client du projet n'en fait | Sans objet |
| `SignatureAlgorithms` | 16 algorithmes : ECDSA et RSA (PKCS#1 et PSS) avec SHA-224 à SHA-512, Ed25519, Ed448. **Aucun SHA-1, aucun MD5.** Liste fermée : elle ne peut que retirer des algorithmes à ceux qu'OpenSSL accepterait | Restreint |
| `Groups` | Les **dix mêmes groupes classiques** que le fichier audité par 0065, dans le même ordre ; le préfixe `*` (syntaxe d'OpenSSL 3.5, [`SSL_CONF_cmd(3)`](https://github.com/openssl/openssl/blob/openssl-3.5/doc/man3/SSL_CONF_cmd.pod), entrée `Groups`) demande d'envoyer une part de clé pour `X25519` | Comme 0065 : pas d'hybride post-quantique, risque (d) |

Absents du fichier, et donc toujours refusés s'ils apparaissent (un octet de plus ferme la barrière) : `VerifyMode`, `VerifyCAFile`, `VerifyCAPath`, `VerifyCAStore`, `ChainCA*`, `RequestCAFile`, `Options`, `.include`, `.pragma`, `engines`, `module`, `default_properties`, tout autre fournisseur.

**L'option `--tls-cipher-list` que le runtime ajoute.** Sa valeur est `CipherString`, `:`, `Ciphersuites` du fichier ci-dessus (constante `OPTION_CHIFFREMENT_LAMBDA_NODEJS26_COMMERCIAL_2025` ; son test vérifie qu'elle se déduit ainsi du contenu audité). Ce que cette liste admet, mesuré par l'auteur avec `openssl ciphers -v` (**OpenSSL 3.0.13 local**, pas le 3.5.9 du runtime : à rejouer par la Sécurité) et comparé à la liste par défaut de Node (`crypto.constants.defaultCoreCipherList`) :

- niveau de sécurité `@SECLEVEL=2` (112 bits au moins : pas de RSA ni de DH sous 2048 bits, pas de SHA-1 dans les signatures) ; `!eNULL` et `!aNULL` : **aucune suite sans chiffrement, aucune suite sans authentification du serveur** ; ni RC4, ni DES, ni 3DES, ni MD5, ni IDEA, ni SEED, ni Camellia, ni ARIA ;
- TLS 1.2, sans clé prépartagée : **34 suites, toutes comprises dans les 58 de la liste par défaut de Node**. La liste du profil est donc un sous-ensemble strict : elle retire DSS, ARIA, CCM8 et les suites CBC à HMAC-SHA384, et n'ajoute rien ;
- TLS 1.2, à clé prépartagée (`kPSK`, `kDHEPSK`, `kECDHEPSK`, `kRSAPSK`) : 26 suites que la liste de Node exclut (`!PSK`). Un client TLS ne les propose que s'il a une clé prépartagée ; aucun code du projet n'en configure (`pskCallback` : aucune occurrence sous `src/`). **À confirmer par la Sécurité** ;
- TLS 1.3 : les trois suites par défaut de Node, plus `TLS_AES_128_CCM_SHA256` (RFC 8446, AEAD à étiquette de 16 octets).

Ce qui est **moins bon que le défaut de Node**, et soumis en section 5 : l'ordre de préférence du client (les suites à échange RSA statique, sans confidentialité persistante, précèdent les suites `DHE` ; la liste par défaut de Node les admet aussi, par `HIGH`, mais en dernier). Le serveur choisit ; OpenRouter et Google négocient TLS 1.3, où cet ordre ne joue pas.

## 4. Décision proposée : admission par contenu audité, option de chiffrement à la graphie près

**Effective seulement après l'avis de la Sécurité** (statut).

1. **Second contenu audité** (même règle que 0065 § 4 point 1, rien d'autre) : quand toutes les conditions de 0062 § 4 tiennent sauf 1.5, le fichier **désigné par `OPENSSL_CONF`** (niveau 0, jamais une inclusion) est admis si ses octets sont **exactement** les 1370 octets de la section 2 point 1. Verdict `contenu_audite`, marque `vercel_runtime_openssl_conf` : **aucune valeur nouvelle** dans les listes fermées du journal. Toute différence, même d'un octet, laisse `section_nodejs` et la barrière fermée.
2. **Option de chiffrement, une seule exception à la règle des options TLS** (0062 § 4 point 2). `--tls-cipher-list` reste dans `OPTIONS_TLS` et reste refusée, **sauf** si toutes ces conditions tiennent (`chiffrementDuProfilSeul`, `src/server/env/egress.ts`) :
   - l'exception est ouverte par **ce** contenu audité (pas par `/dev/null`, pas par le fichier de `nodejs24.x`, pas par un fichier sans `nodejs_conf`) ;
   - `NODE_OPTIONS` ne contient **que** l'espace U+0020 et des caractères ASCII imprimables (U+0021 à U+007E) autres que `"`, `'` et `\`. Sont donc refusés, où qu'ils soient : tout guillemet et tout `\` (Node les interprète) ; **tout blanc autre que l'espace U+0020** (tabulation, `\n`, `\r`, `\v`, `\f`, U+00A0, U+2028, U+FEFF…), tout caractère de contrôle et tout caractère non ASCII. Raison : Node ne découpe `NODE_OPTIONS` que sur l'espace U+0020 ; un autre blanc resterait, pour Node, à l'intérieur de la valeur de l'option (constante, tabulation, `:CAMELLIA` : une autre liste que celle du profil ; écart relevé et mesuré par le Tech Lead sur le head `5031421`, corrigé) ;
   - `NODE_OPTIONS` est découpée **sur l'espace U+0020 seul, comme Node**, et **chaque** jeton qui nomme l'option (au sens d'`optionsDeNode` : `_` pour `-`, formes niées) est **exactement égal** à la constante de la section 3 ;
   - l'option ne figure pas dans `execArgv` (le `bootstrap` ne l'y met pas).
     Sinon : `tls_env_refused`, `cause: "--tls-cipher-list"`, comme aujourd'hui.
3. **Ce qui reste refusé, fermé** : tout autre contenu, dont les profils `commercial-2026` et `cnsa-1.0` de la même couche ; toute autre graphie ou valeur de `--tls-cipher-list` ; toutes les autres options de `OPTIONS_TLS` (`--tls-min-v1.0`, `--tls-min-v1.1`, `--tls-keylog`, `--openssl-config`, `--openssl-shared-config`, `--use-openssl-ca`, `--use-system-ca`, `--openssl-legacy-provider`, `--insecure-http-parser`) ; toute autre variable TLS ; tout proxy ; la production ; hors préversion de Vercel (0062 § 4 condition 1.1). L'admission ne masque aucune autre cause (tests).
4. **Diagnostic : inchangé.** Voie (b) du ticket, pas (a) : aucun jeton ajouté. Raison : le contenu est connu par l'image publique, et le test du point 2 de la section 2 montre que les jetons d'aujourd'hui suffisent à reconnaître la forme du fichier. Ajouter des jetons élargirait la liste fermée du journal sans rien apprendre de plus.
5. **Règle structurelle : non.** Admettre « toute section qui ne contient que des directives jugées sûres » demanderait de juger des valeurs (`CipherString`, `SignatureAlgorithms`) par analyse : plus de surface, plus de risque d'écart d'analyse (0065 § 4 point 6). L'égalité d'octets n'admet que ce qui a été lu par une personne.
6. **Portée** : celle de 0062 § 4 point 4 et de 0065 § 4 point 5 : la barrière entière, en préversion de Vercel seulement (`p0-reel`, et `mvp-essai` depuis 0169). **À relire** à chaque changement de version du runtime ou de version majeure de Node : le fichier changera, la barrière se refermera (échec fermé voulu), et il faudra une décision comme celle-ci.
7. **Voies écartées**, à l'appréciation du Tech Lead :
   - _Fixer `engines.node` à `24.x`_ pour retrouver le runtime `nodejs24.x` et le fichier de 0065 : change la version de Node de **tous** les déploiements, production comprise, et ne fait que reporter la question à la fin de vie de Node 24 ;
   - _Poser `OPENSSL_CONF=/dev/null` ou `AWS_LAMBDA_TLS_PROFILE` dans les variables du projet Vercel_ : réglage Vercel, donc action de Samuel ; et l'ordre d'injection des variables du projet par rapport au `bootstrap` n'est pas établi (0065 § 4 point 6, inchangé).

## 5. Analyse de l'auteur, avis Sécurité à rendre

_Rédigée par le rôle `backend`, auteur de cette proposition. **Ce n'est pas un avis de la Sécurité** et cela ne remplit pas 0055 S-1 point 4._

**Proposition à la Sécurité** : accepter, aux conditions ci-dessous, ou dire lesquelles manquent.

1. **À rejouer** : le téléchargement de la couche `e5336ef7…` et les deux SHA-256 de la section 2 ; la lecture de `resolve-tls-profile.sh` ; la mesure `openssl ciphers -v` de la section 3 avec OpenSSL 3.5 ; les sources Node 26 de la section 2 point 3.
2. **Risque (d) de 0065, à rouvrir** : pas de protection post-quantique des sessions (mêmes dix groupes classiques). L'avis de 0065 l'acceptait « en préversion de `p0-reel` seulement », « à rouvrir à chaque changement de version du runtime ou de Node » : c'est le cas. Depuis, le site d'essai est public derrière un code d'accès (0164, dont le point sur 0062 et 0065 dit ces risques « inchangés », parce qu'ils portent sur le trafic sortant et non sur l'accès au site), et `mvp-essai` partage la barrière (0169).
3. **Risque (e), nouveau** : la liste de chiffrement n'est plus celle de Node mais celle du profil. Elle est plus étroite hors clé prépartagée (section 3) ; restent l'ordre de préférence (RSA statique avant `DHE`) et les suites à clé prépartagée, inertes sans clé. Proposé à l'acceptation dans le même cadre que (d).
4. **Risque (f), nouveau** : la tolérance d'une option TLS repose sur une lecture de `NODE_OPTIONS` par la barrière, qui doit rendre les mêmes jetons que Node. **Correction (revue du Tech Lead du head `5031421`)** : la première version découpait sur tous les blancs (`/\s+/`) alors que Node ne découpe que sur l'espace U+0020 ; la constante suivie d'une tabulation ou d'un retour à la ligne puis d'un suffixe était tolérée, et Node appliquait une autre liste. L'affirmation « sans effet d'affaiblissement » de cette section était donc fausse. Désormais (section 4 point 2) : la tolérance est fermée dès que `NODE_OPTIONS` contient autre chose que l'espace U+0020 et de l'ASCII imprimable sans guillemet ni `\`, et le découpage se fait sur l'espace seul ; dans ce domaine, aucun caractère n'a de sens particulier pour le découpage de Node, et les deux découpages coïncident. Cas restant : un jeton égal à la constante qui suivrait une option attendant sa valeur dans le jeton suivant (forme `--option valeur`) serait lu par Node comme cette valeur ; la liste du profil ne serait alors pas appliquée et Node garderait sa liste par défaut, sans rien admettre de plus. **Non mesuré par l'auteur ; à confirmer par la Sécurité avec le correctif.**
5. **Risques résiduels (a), (b) et (c) de 0062 § 6** : inchangés (fichier par défaut d'OpenSSL non contrôlé ; le fichier examiné peut ne pas être celui que Node a chargé ; dépendance au nom `nodejs_conf`).
6. **Journal** : aucune valeur nouvelle ; ni la liste de chiffrement, ni le chemin, ni un nom de section ne sortent (test sentinelle).
7. **Dépendances, confinement** : aucun import nouveau, aucune ligne nouvelle du régime de confinement ; `env.NODE_OPTIONS` était déjà lue par `egress.ts`.
8. **Constat hors de cette décision, non corrigé ici** : `optionsDeNode` ne retire les guillemets qu'aux bords d'un jeton. Une graphie comme `"--tls-cipher-list"=x`, que Node lit comme `--tls-cipher-list=x`, donne aujourd'hui un nom qui n'est dans aucune liste, donc aucun refus. Cela vaut pour toute option interdite, avant comme après 0178, et ne peut venir que d'une valeur de `NODE_OPTIONS` écrite ainsi par la plateforme ou le projet. Un ticket séparé est proposé (question ouverte 3).

## 6. Code livré (PR du ticket #1141)

1. `src/server/env/openssl-conf.ts` : constantes `CONTENU_OPENSSL_AUDITE_LAMBDA_NODEJS26_COMMERCIAL_2025` et `OPTION_CHIFFREMENT_LAMBDA_NODEJS26_COMMERCIAL_2025` ; `egalAuContenu(octets, audite)` remplace `egalAuContenuAudite(octets)` ; `examinerOpensslConf` rend `optionChiffrementAdmise` avec ce contenu seulement.
2. `src/server/env/egress.ts` : `chiffrementDuProfilSeul` ; `causeTls` ignore `--tls-cipher-list` dans ce seul cas ; `optionsDeNode` garde son comportement (sa boucle devient `nomsDOption`, partagée).
3. Tests : `src/server/env/openssl-conf.test.ts` (constante, SHA-256, jetons du journal, déduction de l'option, 17 variantes à un détail près toutes refusées, inclusion, octet invalide, lien, taille) et `src/server/env/egress.test.ts` (ouverture, 13 graphies refusées, 8 blancs autres que l'espace à 6 places chacun, caractères de contrôle et non ASCII, `execArgv`, autre contenu, hors préversion, production, `env_differente`, `nom_section_refuse`, aucune autre cause masquée, sentinelle). Aucun test désactivé ni supprimé.
4. Renvoi en tête de 0065 § 4.
5. Hors barrière, même ticket : `/connexion` sur le site d'essai (adaptateur `prototype`) dont la garde de l'adaptateur `auth` est fermée rend une page introuvable au lieu d'une erreur 500 ; la garde reste fermée, et rien ne change hors site d'essai (`src/app/(creation)/connexion/page.tsx`, `tests/unit/connexion-page.test.tsx`). La page ne rattrape aucune erreur : elle lit les prédicats exportés de la garde (`authAdapterChoice`, `mockAuthAllowed`, `betterAuthAllowed` : les trois cas d'`assertAuthAdapter`), si bien qu'une panne de l'adaptateur n'est pas masquée. Pas de ligne de journal : `@/server/log` ne s'importe pas hors de `src/server` (décision 0020 § 11).

## 7. Relevé suivant (après l'avis, la fusion, puis la mise à jour de `p0-reel`)

`p0-reel` ne reçoit ce code que par une fusion de `main` dans `p0-reel` et un nouveau déploiement de préversion : **action de Samuel** (ou du rôle `release` sur sa demande), comme après 0062 et 0065. Puis lire la ligne `p0.guard_closed`, ou son absence, en noms et codes seulement :

- plus de `tls_env_refused` (un autre code avec `exception: "vercel_runtime_openssl_conf"`, ou aucune ligne) : le fichier et l'option sont ceux audités ; le relevé continue par 0062 § 8 ;
- `tls_env_refused`, `cause: "--tls-cipher-list"`, `openssl_conf_verdict: "contenu_audite"` : le fichier est le bon, mais `NODE_OPTIONS` ne porte pas l'option sous la graphie du script (section 2 point 4) ; nouvelle décision courte, avec avis Sécurité ;
- `tls_env_refused`, `cause: "OPENSSL_CONF"`, `section_nodejs`, mêmes directives qu'en section 1 : même forme, autres octets (autre version du runtime) ; refaire la section 2 sur la couche du jour ;
- une autre `cause` : lecture de 0062 § 8, inchangée.

## Ce qui revient à qui

- **Sécurité** : l'avis de la section 5 (0055 S-1 point 4), dont les risques (d), (e) et (f). Bloque la fusion.
- **Tech Lead** : la décision elle-même (section 4), le choix entre cette voie et celles du point 7, la revue du code.
- **Samuel** : rien à trancher si la Sécurité et le Tech Lead acceptent dans le cadre déjà posé par 0065 (préversion, clés révocables). Lui reviendraient : la mise à jour de `p0-reel` (section 7) ; tout réglage Vercel (section 4 point 7) ; et **l'acceptation du risque** si la Sécurité juge que (d), (e) ou (f) dépasse ce cadre, par exemple parce que le site d'essai est public. Cette acceptation ne se tranche pas ici.

## Questions ouvertes

1. **Sécurité** — Rendre l'avis de la section 5. Bloque l'effet de l'admission et la fusion de la PR, donc la réouverture du site d'essai.
2. **Tech Lead** — Valider ou refuser la section 4, et dire si `engines.node` doit être borné pour que le runtime ne change plus sans décision. Bloque la fusion.
3. **Tech Lead, Sécurité** — Ouvrir un ticket pour le constat de la section 5 point 8 (guillemets à l'intérieur d'un jeton de `NODE_OPTIONS`) ? Ne bloque rien ici.
4. **Samuel** — Après la fusion : mettre `p0-reel` à jour depuis `main` (et `mvp-essai` quand elle sera déployée). Bloque le test grandeur nature.
