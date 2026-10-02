// Security rules tests. Every test talks to the Firestore emulator directly, the way an
// attacker with a valid account (or none) could, bypassing the app completely.
// Run: npx firebase-tools emulators:exec --only firestore --project demo-verth "node --test test/rules.test.mjs"
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp, increment, arrayUnion,
  collection, getDocs,
} from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-verth',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });

const db = (uid, email = `${uid}@x.in`, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const PUB = { x: 'A'.repeat(43), y: 'B'.repeat(43) };
const PUB2 = { x: 'C'.repeat(43), y: 'D'.repeat(43) };
const device = (n = 1, k = PUB) => ({ dh: k, sig: k, n, at: serverTimestamp(), label: 'Chrome on Linux' });
const SIG = 'M'.repeat(88);
const CODE = 'ABCD2345';
const inMin = (m) => Timestamp.fromMillis(Date.now() + m * 60000);

// A circle "c1" owned by rajesh (admin), with priya (active), mallory (pending).
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    const now = Timestamp.now();
    for (const u of ['rajesh', 'priya', 'mallory', 'outsider']) {
      await setDoc(doc(f, 'users', u), { name: u, email: `${u}@x.in`, plan: 'free', circles: [], activeCircle: null, onboarded: true, createdAt: now });
    }
    await setDoc(doc(f, 'circles/c1'), { name: 'Nirmaan', type: 'org', ownerUid: 'rajesh', inviteCode: CODE, joinOpen: true, plan: 'free', memberCount: 3, createdAt: now });
    await setDoc(doc(f, 'invites', CODE), { circleId: 'c1', circleName: 'Nirmaan', type: 'org', createdBy: 'rajesh', createdAt: now });
    const m = (uid, role, status) => ({ uid, name: uid === 'rajesh' ? 'Rajesh Mehta' : uid === 'priya' ? 'Priya Nair' : 'Mallory', title: 't', email: `${uid}@x.in`, role, status, device: { dh: PUB, sig: PUB, n: 1, at: now, label: 'x' }, joinedAt: now });
    await setDoc(doc(f, 'circles/c1/members/rajesh'), m('rajesh', 'admin', 'active'));
    await setDoc(doc(f, 'circles/c1/members/priya'), m('priya', 'member', 'active'));
    await setDoc(doc(f, 'circles/c1/members/mallory'), { ...m('mallory', 'member', 'pending'), inviteCode: CODE });
    await setDoc(doc(f, 'circles/c1/checks/open'), { kind: 'push', fromUid: 'priya', fromName: 'Priya Nair', toUid: 'rajesh', toName: 'Rajesh Mehta', channel: 'WhatsApp', summary: 'pay 4.8L', status: 'pending', createdAt: now, expiresAt: inMin(3) });
    await setDoc(doc(f, 'circles/c1/checks/old'), { kind: 'push', fromUid: 'priya', fromName: 'Priya Nair', toUid: 'rajesh', toName: 'Rajesh Mehta', channel: 'WhatsApp', summary: 'old', status: 'pending', createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  });
}

const push = (over = {}) => ({ kind: 'push', fromUid: 'priya', fromName: 'Priya Nair', toUid: 'rajesh', toName: 'Rajesh Mehta', channel: 'WhatsApp', summary: 'pay vendor', status: 'pending', createdAt: serverTimestamp(), expiresAt: inMin(3), ...over });
const answer = (over = {}) => ({ status: 'confirmed', answeredAt: serverTimestamp(), sig: SIG, sigN: 1, ...over });

/* ---------- accounts ---------- */
test('unverified email cannot read or write anything', async () => {
  const f = db('priya', 'priya@x.in', false);
  await assertFails(getDoc(doc(f, 'users/priya')));
  await assertFails(getDoc(doc(f, 'circles/c1')));
});
test('signed-out visitors get nothing', async () => {
  await assertFails(getDoc(doc(anon(), 'circles/c1')));
  await assertFails(getDoc(doc(anon(), 'invites', CODE)));
});
test('profiles are private and the plan is locked', async () => {
  await assertFails(getDoc(doc(db('priya'), 'users/rajesh')));
  await assertSucceeds(getDoc(doc(db('priya'), 'users/priya')));
  await assertFails(updateDoc(doc(db('priya'), 'users/priya'), { plan: 'team' }));
  await assertFails(updateDoc(doc(db('priya'), 'users/priya'), { isAdmin: true }));
  await assertSucceeds(updateDoc(doc(db('priya'), 'users/priya'), { activeCircle: 'c1' }));
});
test('new profile must be free and use your real email', async () => {
  const f = db('newbie');
  await assertFails(setDoc(doc(f, 'users/newbie'), { name: 'N', email: 'boss@x.in', plan: 'free', circles: [], activeCircle: null, onboarded: false, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(f, 'users/newbie'), { name: 'N', email: 'newbie@x.in', plan: 'team', circles: [], activeCircle: null, onboarded: false, createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(f, 'users/newbie'), { name: 'N', email: 'newbie@x.in', plan: 'free', circles: [], activeCircle: null, onboarded: false, createdAt: serverTimestamp() }));
});

/* ---------- creating circles ---------- */
function createBatch(f, uid, over = {}, code = 'WXYZ6789') {
  const b = writeBatch(f);
  b.set(doc(f, 'circles/c2'), { name: 'Fam', type: 'family', ownerUid: uid, inviteCode: code, joinOpen: true, plan: 'free', memberCount: 1, createdAt: serverTimestamp(), ...over });
  b.set(doc(f, 'circles/c2/members', uid), { uid, name: 'Out Sider', title: 'Dad', email: `${uid}@x.in`, role: 'admin', status: 'active', device: device(), joinedAt: serverTimestamp() });
  b.set(doc(f, 'invites', code), { circleId: 'c2', circleName: 'Fam', type: 'family', createdBy: uid, createdAt: serverTimestamp() });
  return b.commit();
}
test('anyone verified can create a free circle', async () => { await assertSucceeds(createBatch(db('outsider'), 'outsider')); });
test('cannot create a circle on a paid plan or with extra fields', async () => {
  await assertFails(createBatch(db('outsider'), 'outsider', { plan: 'team' }));
  await assertFails(createBatch(db('outsider'), 'outsider', { verified: true }));
  await assertFails(createBatch(db('outsider'), 'outsider', { memberCount: 0 }));
});
test('invite codes must be 8 safe characters', async () => {
  await assertFails(createBatch(db('outsider'), 'outsider', {}, 'AB12'));
  await assertFails(createBatch(db('outsider'), 'outsider', { inviteCode: 'IIIIOOOO' }, 'IIIIOOOO'));
});
test('cannot create a circle in someone else’s name', async () => { await assertFails(createBatch(db('outsider'), 'rajesh')); });

/* ---------- joining ---------- */
function joinBatch(f, uid, over = {}, countDelta = 1) {
  const b = writeBatch(f);
  b.set(doc(f, 'circles/c1/members', uid), { uid, name: 'Out Sider', title: 'x', email: `${uid}@x.in`, role: 'member', status: 'pending', device: device(), inviteCode: CODE, joinedAt: serverTimestamp(), ...over });
  b.update(doc(f, 'circles/c1'), { memberCount: increment(countDelta) });
  return b.commit();
}
test('joining with the right code makes you pending', async () => { await assertSucceeds(joinBatch(db('outsider'), 'outsider')); });
test('joining with a wrong or old code fails', async () => { await assertFails(joinBatch(db('outsider'), 'outsider', { inviteCode: 'ZZZZ9999' })); });
test('cannot join as active or as admin', async () => {
  await assertFails(joinBatch(db('outsider'), 'outsider', { status: 'active' }));
  await assertFails(joinBatch(db('outsider'), 'outsider', { role: 'admin', status: 'active' }));
});
test('cannot join with a fake email', async () => { await assertFails(joinBatch(db('outsider'), 'outsider', { email: 'rajesh@x.in' })); });
test('cannot join without counting yourself, or count twice', async () => {
  await assertFails(joinBatch(db('outsider'), 'outsider', {}, 0));
  await assertFails(joinBatch(db('outsider'), 'outsider', {}, 2));
});
test('cannot join when joining is closed', async () => {
  await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), 'circles/c1'), { joinOpen: false }));
  await assertFails(joinBatch(db('outsider'), 'outsider'));
});
test('cannot join a full free circle', async () => {
  await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), 'circles/c1'), { memberCount: 5 }));
  await assertFails(joinBatch(db('outsider'), 'outsider'));
});
test('invite codes can be looked up but never listed', async () => {
  await assertSucceeds(getDoc(doc(db('outsider'), 'invites', CODE)));
  await assertFails(getDocs(collection(db('outsider'), 'invites')));
});

/* ---------- who can see what ---------- */
test('outsiders and pending members cannot read the circle', async () => {
  for (const u of ['outsider', 'mallory']) {
    await assertFails(getDoc(doc(db(u), 'circles/c1')));
    await assertFails(getDocs(collection(db(u), 'circles/c1/members')));
    await assertFails(getDocs(collection(db(u), 'circles/c1/checks')));
  }
  await assertSucceeds(getDoc(doc(db('mallory'), 'circles/c1/members/mallory')));
});
test('active members can read the circle and log', async () => {
  await assertSucceeds(getDoc(doc(db('priya'), 'circles/c1')));
  await assertSucceeds(getDocs(collection(db('priya'), 'circles/c1/checks')));
});

/* ---------- approval and roles ---------- */
const approve = (f, uid, by) => updateDoc(doc(f, 'circles/c1/members', uid), { status: 'active', approvedBy: by, approvedAt: serverTimestamp() });
test('admin approves pending members', async () => { await assertSucceeds(approve(db('rajesh'), 'mallory', 'rajesh')); });
test('members and pending people cannot approve', async () => {
  await assertFails(approve(db('priya'), 'mallory', 'priya'));
  await assertFails(approve(db('mallory'), 'mallory', 'mallory'));
});
test('nobody can make themselves admin or rename themselves', async () => {
  await assertFails(updateDoc(doc(db('priya'), 'circles/c1/members/priya'), { role: 'admin' }));
  await assertFails(updateDoc(doc(db('priya'), 'circles/c1/members/priya'), { name: 'Rajesh Mehta' }));
  await assertSucceeds(updateDoc(doc(db('priya'), 'circles/c1/members/priya'), { title: 'Senior accounts' }));
});
test('members cannot change circle settings or member count', async () => {
  await assertFails(updateDoc(doc(db('priya'), 'circles/c1'), { joinOpen: false }));
  await assertFails(updateDoc(doc(db('priya'), 'circles/c1'), { plan: 'team' }));
  await assertFails(updateDoc(doc(db('priya'), 'circles/c1'), { memberCount: 1 }));
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1'), { plan: 'team' }));
});
test('admin can rotate the invite code; members cannot', async () => {
  const rotate = (f, uid) => { const b = writeBatch(f); b.update(doc(f, 'circles/c1'), { inviteCode: 'NEWC0DE2'.replace('0', 'Q') }); b.set(doc(f, 'invites/NEWCQDE2'), { circleId: 'c1', circleName: 'Nirmaan', type: 'org', createdBy: uid, createdAt: serverTimestamp() }); b.delete(doc(f, 'invites', CODE)); return b.commit(); };
  await assertFails(rotate(db('priya'), 'priya'));
  await assertSucceeds(rotate(db('rajesh'), 'rajesh'));
});
test('cannot create an invite that points at someone else’s circle', async () => {
  await assertFails(setDoc(doc(db('outsider'), 'invites/HJKM2345'), { circleId: 'c1', circleName: 'Nirmaan', type: 'org', createdBy: 'outsider', createdAt: serverTimestamp() }));
});
test('admin can remove members but not other admins; members cannot remove others', async () => {
  const rm = (f, uid) => { const b = writeBatch(f); b.delete(doc(f, 'circles/c1/members', uid)); b.update(doc(f, 'circles/c1'), { memberCount: increment(-1), lastRemoved: uid }); return b.commit(); };
  await assertFails(rm(db('priya'), 'mallory'));
  await assertFails(rm(db('priya'), 'rajesh'));
  await assertSucceeds(rm(db('rajesh'), 'mallory'));
});
test('ATTACK: an admin cannot lower the member count without removing someone (to dodge the plan limit)', async () => {
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1'), { memberCount: 2 }));
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1'), { memberCount: 2, lastRemoved: 'mallory' }));  // mallory not actually removed
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1'), { memberCount: 2, lastRemoved: 'nobody' }));
  // removing someone without lowering the count is refused too
  await assertFails(deleteDoc(doc(db('rajesh'), 'circles/c1/members/mallory')));
});
test('a member can leave a circle, lowering the count by one', async () => {
  const b = writeBatch(db('priya')); b.delete(doc(db('priya'), 'circles/c1/members/priya')); b.update(doc(db('priya'), 'circles/c1'), { memberCount: increment(-1), lastRemoved: 'priya' });
  await assertSucceeds(b.commit());
});
test('invite records must carry a sensible name and type', async () => {
  const rotate = (f, extra) => { const b = writeBatch(f); b.update(doc(f, 'circles/c1'), { inviteCode: 'NEWCQDE2' }); b.set(doc(f, 'invites/NEWCQDE2'), { circleId: 'c1', circleName: 'Nirmaan', type: 'org', createdBy: 'rajesh', createdAt: serverTimestamp(), ...extra }); return b.commit(); };
  await assertFails(rotate(db('rajesh'), { circleName: 'x'.repeat(500) }));
  await assertFails(rotate(db('rajesh'), { type: 'bank' }));
});

/* ---------- devices ---------- */
test('a member switching device goes back to pending, and the counter must go up', async () => {
  const ref = (f) => doc(f, 'circles/c1/members/priya');
  await assertFails(updateDoc(ref(db('priya')), { device: device(2, PUB2) }));                    // stays active: refused
  await assertFails(updateDoc(ref(db('priya')), { device: device(1, PUB2), status: 'pending' })); // counter not increased
  await assertFails(updateDoc(ref(db('priya')), { device: device(5, PUB2), status: 'pending' })); // counter skipped
  await assertSucceeds(updateDoc(ref(db('priya')), { device: device(2, PUB2), status: 'pending' }));
});
test('an admin switching device stays active', async () => {
  await assertSucceeds(updateDoc(doc(db('rajesh'), 'circles/c1/members/rajesh'), { device: device(2, PUB2) }));
});
test('device keys must look like real public keys', async () => {
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1/members/rajesh'), { device: { ...device(2), dh: { x: 'short', y: 'short' } } }));
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1/members/rajesh'), { device: { ...device(2), d: 'PRIVATE' } }));
});

/* ---------- checks ---------- */
// A check is written together with the sender's anti-flood meter, like the app does.
const newCheck = (f, data, meterUid) => { const b = writeBatch(f); b.set(doc(collection(f, 'circles/c1/checks')), data); b.set(doc(f, `users/${meterUid || data.fromUid}/meters/checks`), { at: serverTimestamp() }); return b.commit(); };
test('ATTACK: checks without the anti-flood meter, or faster than one per 5 seconds, are refused', async () => {
  await assertFails(setDoc(doc(collection(db('priya'), 'circles/c1/checks')), push()));
  await assertSucceeds(newCheck(db('priya'), push()));
  await assertFails(newCheck(db('priya'), push()));
  await assertFails(setDoc(doc(db('priya'), 'users/priya/meters/checks'), { at: serverTimestamp() }));
  await assertFails(setDoc(doc(db('priya'), 'users/rajesh/meters/checks'), { at: serverTimestamp() }));
});
test('an active member can send a check', async () => { await assertSucceeds(newCheck(db('priya'), push())); });
test('cannot fake who a check is from, or the names shown', async () => {
  await assertFails(newCheck(db('priya'), push({ fromUid: 'rajesh', fromName: 'Rajesh Mehta', toUid: 'priya', toName: 'Priya Nair' })));
  await assertFails(newCheck(db('priya'), push({ fromName: 'Rajesh Mehta (CEO)' })));
  await assertFails(newCheck(db('priya'), push({ toName: 'Someone Else' })));
});
test('cannot send checks to yourself, to pending people, or as a pending person', async () => {
  await assertFails(newCheck(db('priya'), push({ toUid: 'priya', toName: 'Priya Nair' })));
  await assertFails(newCheck(db('priya'), push({ toUid: 'mallory', toName: 'Mallory' })));
  await assertFails(newCheck(db('mallory'), push({ fromUid: 'mallory', fromName: 'Mallory' })));
  await assertFails(newCheck(db('outsider'), push({ fromUid: 'outsider', fromName: 'Out' })));
});
test('cannot create a check that is already answered, or lasts too long, or has extra fields', async () => {
  await assertFails(newCheck(db('priya'), push({ status: 'confirmed' })));
  await assertFails(newCheck(db('priya'), push({ expiresAt: inMin(60) })));
  await assertFails(newCheck(db('priya'), push({ sig: SIG })));
  await assertFails(newCheck(db('priya'), push({ channel: 'Carrier pigeon' })));
  await assertFails(newCheck(db('priya'), push({ summary: 'x'.repeat(201) })));
});
test('only the named person can answer, with a signature from their current device', async () => {
  const ref = (f) => doc(f, 'circles/c1/checks/open');
  await assertFails(updateDoc(ref(db('priya')), answer()));
  await assertFails(updateDoc(ref(db('mallory')), answer()));
  await assertFails(updateDoc(ref(db('rajesh')), answer({ sig: null })));
  await assertFails(updateDoc(ref(db('rajesh')), answer({ sigN: 7 })));
  await assertFails(updateDoc(ref(db('rajesh')), answer({ status: 'maybe' })));
  await assertFails(updateDoc(ref(db('rajesh')), { ...answer(), summary: 'pay 1 rupee' }));
  await assertSucceeds(updateDoc(ref(db('rajesh')), answer()));
});
test('an answer cannot be changed afterwards', async () => {
  await assertSucceeds(updateDoc(doc(db('rajesh'), 'circles/c1/checks/open'), answer({ status: 'denied' })));
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1/checks/open'), answer({ status: 'confirmed' })));
});
test('expired checks cannot be answered', async () => {
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1/checks/old'), answer()));
});
test('only the person who asked can mark a check as reported', async () => {
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1/checks/open'), { reported: true }));
  await assertSucceeds(updateDoc(doc(db('priya'), 'circles/c1/checks/open'), { reported: true }));
});
test('the log can never be deleted', async () => {
  await assertFails(deleteDoc(doc(db('rajesh'), 'circles/c1/checks/open')));
  await assertFails(deleteDoc(doc(db('priya'), 'circles/c1/checks/open')));
});

/* ---------- scam checks: daily limit ---------- */
const today = () => String(Math.floor((Date.now() + 19800000) / 86400000));
test('free accounts get two scam checks a day, then the database refuses', async () => {
  const f = db('priya'), ref = doc(f, 'users/priya/usage', today());
  await assertSucceeds(setDoc(ref, { scans: 1, at: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { scans: increment(1), at: serverTimestamp() }));
  await assertFails(updateDoc(ref, { scans: increment(1), at: serverTimestamp() }));
});
test('the scan counter can’t be reset, skipped, or written for another day', async () => {
  const f = db('priya');
  await assertFails(setDoc(doc(f, 'users/priya/usage', String(Number(today()) + 1)), { scans: 1, at: serverTimestamp() }));
  await assertFails(setDoc(doc(f, 'users/priya/usage', today()), { scans: 0, at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(f, 'users/priya/usage', today()), { scans: 1, at: serverTimestamp() }));
  await assertFails(setDoc(doc(f, 'users/priya/usage', today()), { scans: 1, at: serverTimestamp() }));
  await assertFails(updateDoc(doc(f, 'users/priya/usage', today()), { scans: 1, at: serverTimestamp() }));
  await assertFails(deleteDoc(doc(f, 'users/priya/usage', today())));
});
test('nobody can use or read someone else’s scan counter', async () => {
  await assertFails(setDoc(doc(db('priya'), 'users/rajesh/usage', today()), { scans: 1, at: serverTimestamp() }));
  await assertFails(getDoc(doc(db('priya'), 'users/rajesh/usage', today())));
});
test('paid accounts can scan without the daily cap', async () => {
  await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), 'users/rajesh'), { plan: 'personal' }));
  const f = db('rajesh'), ref = doc(f, 'users/rajesh/usage', today());
  await assertSucceeds(setDoc(ref, { scans: 1, at: serverTimestamp() }));
  for (let i = 0; i < 3; i++) await assertSucceeds(updateDoc(ref, { scans: increment(1), at: serverTimestamp() }));
});

/* ---------- paid plans ---------- */
const asServer = (path, data) => env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), path), data));
test('nobody but the payments server can set plans, seats or billing', async () => {
  await assertFails(updateDoc(doc(db('rajesh'), 'users/rajesh'), { billing: { status: 'active' } }));
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1'), { seats: 500 }));
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1'), { billing: { status: 'active' } }));
  await assertFails(updateDoc(doc(db('rajesh'), 'circles/c1'), { plan: 'family' }));
});
test('family members get unlimited scam checks through their circle', async () => {
  await asServer('circles/c1', { plan: 'family', seats: 10 });
  const f = db('priya'), ref = doc(f, 'users/priya/usage', today());
  await assertSucceeds(setDoc(ref, { scans: 1, at: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { scans: increment(1), at: serverTimestamp() }));
  await assertFails(updateDoc(ref, { scans: increment(1), at: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { scans: increment(1), at: serverTimestamp(), via: 'c1' }));
  await assertSucceeds(updateDoc(ref, { scans: increment(1), at: serverTimestamp(), via: 'c1' }));
});
test('ATTACK: pending members and outsiders can’t borrow a paid circle', async () => {
  await asServer('circles/c1', { plan: 'team', seats: 20 });
  for (const uid of ['mallory', 'outsider']) {
    const ref = doc(db(uid), `users/${uid}/usage`, today());
    await assertSucceeds(setDoc(ref, { scans: 1, at: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { scans: increment(1), at: serverTimestamp() }));
    await assertFails(updateDoc(ref, { scans: increment(1), at: serverTimestamp(), via: 'c1' }));
  }
});
test('a free circle doesn’t unlock scans', async () => {
  const ref = doc(db('priya'), 'users/priya/usage', today());
  await assertSucceeds(setDoc(ref, { scans: 1, at: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { scans: increment(1), at: serverTimestamp() }));
  await assertFails(updateDoc(ref, { scans: increment(1), at: serverTimestamp(), via: 'c1' }));
});
test('a Team circle has no practical limit on people (2,000)', async () => {
  await asServer('circles/c1', { plan: 'team', seats: 2000, memberCount: 600 });
  await assertSucceeds(joinBatch(db('outsider'), 'outsider'));
  await asServer('circles/c1', { memberCount: 2000 });
  await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), 'circles/c1/members/outsider')));
  await assertFails(joinBatch(db('outsider'), 'outsider'));
});
test('a Family circle can hold 10 people', async () => {
  await asServer('circles/c1', { plan: 'family', seats: 10, memberCount: 9 });
  await assertSucceeds(joinBatch(db('outsider'), 'outsider'));
});

/* ---------- photo checks ---------- */
const photos = (uid) => doc(db(uid), `users/${uid}/meters/photos`);
test('free accounts get 5 photo checks in total, then the database refuses', async () => {
  const ref = photos('priya');
  await assertSucceeds(setDoc(ref, { count: 1, at: serverTimestamp() }));
  for (let i = 2; i <= 5; i++) await assertSucceeds(updateDoc(ref, { count: increment(1), at: serverTimestamp() }));
  await assertFails(updateDoc(ref, { count: increment(1), at: serverTimestamp() }));
});
test('the photo counter can’t be reset, skipped, deleted or used by others', async () => {
  const ref = photos('priya');
  await assertFails(setDoc(ref, { count: 0, at: serverTimestamp() }));
  await assertSucceeds(setDoc(ref, { count: 1, at: serverTimestamp() }));
  await assertFails(setDoc(ref, { count: 1, at: serverTimestamp() }));
  await assertFails(updateDoc(ref, { count: 3, at: serverTimestamp() }));
  await assertFails(deleteDoc(ref));
  await assertFails(setDoc(doc(db('priya'), 'users/priya/meters/other'), { count: 1, at: serverTimestamp() }));
  await assertFails(getDoc(doc(db('rajesh'), 'users/priya/meters/photos')));
  await assertFails(setDoc(doc(db('rajesh'), 'users/priya/meters/photos'), { count: 1, at: serverTimestamp() }));
});
test('paid plans and paid circles unlock unlimited photo checks', async () => {
  await asServer('users/rajesh', { plan: 'personal' });
  const r = photos('rajesh');
  await assertSucceeds(setDoc(r, { count: 1, at: serverTimestamp() }));
  for (let i = 2; i <= 7; i++) await assertSucceeds(updateDoc(r, { count: increment(1), at: serverTimestamp() }));
  await asServer('circles/c1', { plan: 'family', seats: 10 });
  const p = photos('priya');
  await assertSucceeds(setDoc(p, { count: 1, at: serverTimestamp() }));
  for (let i = 2; i <= 5; i++) await assertSucceeds(updateDoc(p, { count: increment(1), at: serverTimestamp() }));
  await assertFails(updateDoc(p, { count: increment(1), at: serverTimestamp() }));
  await assertSucceeds(updateDoc(p, { count: increment(1), at: serverTimestamp(), via: 'c1' }));
  const m = photos('mallory');
  await assertSucceeds(setDoc(m, { count: 1, at: serverTimestamp() }));
  for (let i = 2; i <= 5; i++) await assertSucceeds(updateDoc(m, { count: increment(1), at: serverTimestamp() }));
  await assertFails(updateDoc(m, { count: increment(1), at: serverTimestamp(), via: 'c1' }));
});

/* ---------- community scam reports ---------- */
const FP = 'a'.repeat(64);
test('a signed-in user can report once, and anyone signed in can count reports', async () => {
  await assertSucceeds(setDoc(doc(db('priya'), 'reports', FP, 'by', 'priya'), { kind: 'phone', at: serverTimestamp() }));
  await assertFails(setDoc(doc(db('priya'), 'reports', FP, 'by', 'priya'), { kind: 'link', at: serverTimestamp() }));
  await assertSucceeds(getDocs(collection(db('outsider'), 'reports', FP, 'by')));
});
test('reports can’t be faked for others, carry content, or use a non-fingerprint id', async () => {
  await assertFails(setDoc(doc(db('priya'), 'reports', FP, 'by', 'rajesh'), { kind: 'phone', at: serverTimestamp() }));
  await assertFails(setDoc(doc(db('priya'), 'reports', FP, 'by', 'priya'), { kind: 'phone', at: serverTimestamp(), number: '+919876543210' }));
  await assertFails(setDoc(doc(db('priya'), 'reports', '9876543210', 'by', 'priya'), { kind: 'phone', at: serverTimestamp() }));
  await assertFails(getDocs(collection(anon(), 'reports', FP, 'by')));
});
