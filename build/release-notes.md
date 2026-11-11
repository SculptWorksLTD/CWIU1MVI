CWIU1MVI: decoder CW per Mac, Windows e Linux. Sviluppato da IU1MVI, uso libero per tutti gli OM.

**Installazione**
- **Mac:** scarica `Mac.pkg` e aprilo. Se il Mac lo blocca: Impostazioni di Sistema › Privacy e sicurezza › Apri comunque.
- **Windows:** scarica `Setup.exe` e aprilo. Se compare "PC protetto da Windows": Ulteriori informazioni › Esegui comunque.
- **Linux (PC a 64 bit):** `Linux.deb` per Debian, Ubuntu e Mint (`sudo apt install ./CWIU1MVI-…-Linux.deb`), oppure `Linux.AppImage` per le altre distribuzioni (rendilo eseguibile e avvialo; su Ubuntu serve `libfuse2`). Per il CAT aggiungi il tuo utente al gruppo della porta seriale e rientra: `sudo usermod -aG dialout $USER`.

Chi ha già CWIU1MVI su Mac o Windows non deve fare niente: si aggiorna da solo all'avvio. Su Linux decoder e interfaccia si aggiornano da soli; per una nuova versione completa si scarica di nuovo il pacchetto da qui.

**1.2.7**
- Mac e Linux: CWIU1MVI può raggiungere la radio attraverso The Rigger, così i due programmi (e gli altri collegati a The Rigger) lavorano insieme. In Impostazioni della radio, alla voce Collegamento, scegli una delle porte "The Rigger · …" e premi Collega CAT. Su Windows le porte di The Rigger sono porte COM normali: si scelgono dall'elenco delle porte.
- Se la radio non risponde, il messaggio ora dice anche di controllare che non sia occupata da un altro programma.

**1.2.6**
- Mac: dopo un aggiornamento non compare più la richiesta del portachiavi e il CAT si ricollega subito. Chi usa HamQTH deve reinserire una volta utente e password nelle Preferenze.

**1.2.5**
- Gli aggiornamenti arrivano dalla nuova repo CWIU1MVI.
- Linux: pacchetti AppImage e .deb.
