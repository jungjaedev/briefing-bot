import dns from 'node:dns';
import net from 'node:net';

// Oracle host has IPv4 connectivity only.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
