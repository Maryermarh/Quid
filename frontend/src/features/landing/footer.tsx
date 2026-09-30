"use client";

import { motion, Variants } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

const logoVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

const linkVariants: Variants = {
  rest: { color: "#999999" },
  hover: { color: "#FFFFFF" },
};

export default function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 3000);
    }
  };

  const platformLinks = ["Create Quest", "Take Quest"];
  const resourceLinks = ["Documentation", "API Reference", "Support", "Blog"];
  const communityLinks = ["Discord", "X", "GitHub", "Forum"];

  return (
    <footer className="bg-black pt-[80px] sm:pt-[100px] pb-0 px-4 sm:px-6 lg:px-8">
      {/* Logo Section */}
      <motion.div
        className="flex justify-center mb-16 sm:mb-20"
        variants={logoVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
      >
        <div className="relative w-[120px] sm:w-[140px] h-[40px] sm:h-[50px]">
          <Image
            src="/namelogo.png"
            alt="Quid Logo"
            fill
            className="object-contain"
            priority
          />
        </div>
      </motion.div>

      {/* Main Grid */}
      <motion.div
        className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 mb-12 sm:mb-16"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
      >
        {/* Column 1: Platform */}
        <motion.div variants={itemVariants}>
          <h3 className="text-base sm:text-lg font-bold text-white mb-4 sm:mb-6">
            Platform
          </h3>
          <ul className="space-y-2 sm:space-y-3">
            {platformLinks.map((link) => (
              <li key={link}>
                <motion.a
                  href="#"
                  className="text-sm sm:text-base text-gray-600 hover:text-white transition-colors duration-300"
                  variants={linkVariants}
                  initial="rest"
                  whileHover="hover"
                >
                  {link}
                </motion.a>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Column 2: Resources */}
        <motion.div variants={itemVariants}>
          <h3 className="text-base sm:text-lg font-bold text-white mb-4 sm:mb-6">
            Resources
          </h3>
          <ul className="space-y-2 sm:space-y-3">
            {resourceLinks.map((link) => (
              <li key={link}>
                <motion.a
                  href="#"
                  className="text-sm sm:text-base text-gray-600 hover:text-white transition-colors duration-300"
                  variants={linkVariants}
                  initial="rest"
                  whileHover="hover"
                >
                  {link}
                </motion.a>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Column 3: Community */}
        <motion.div variants={itemVariants}>
          <h3 className="text-base sm:text-lg font-bold text-white mb-4 sm:mb-6">
            Community
          </h3>
          <ul className="space-y-2 sm:space-y-3">
            {communityLinks.map((link) => (
              <li key={link}>
                <motion.a
                  href="#"
                  className="text-sm sm:text-base text-gray-600 hover:text-white transition-colors duration-300"
                  variants={linkVariants}
                  initial="rest"
                  whileHover="hover"
                >
                  {link}
                </motion.a>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Column 4: Newsletter */}
        <motion.div variants={itemVariants}>
          <h3 className="text-base sm:text-lg font-bold text-white mb-4 sm:mb-6">
            Subscribe to newsletter
          </h3>
          <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/40 transition-colors duration-300"
            />
            <button
              type="submit"
              className="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-300 text-sm sm:text-base"
            >
              {subscribed ? "Subscribed! ✓" : "Subscribe"}
            </button>
          </form>
        </motion.div>
      </motion.div>

      {/* Divider */}
      <div className="border-t border-white/10 my-12 sm:my-16" />

      {/* Bottom Bar */}
      <motion.div
        className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pb-8 sm:pb-12 text-xs sm:text-sm"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
      >
        {/* Copyright */}
        <motion.span variants={itemVariants} className="text-gray-600">
          © 2026 Quid
        </motion.span>

        {/* Legal Links */}
        <motion.div
          className="flex items-center gap-6 sm:gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.div variants={itemVariants}>
            <Link
              href="/privacy"
              className="text-gray-600 hover:text-white transition-colors duration-300"
            >
              Privacy Policy
            </Link>
          </motion.div>
          <motion.div variants={itemVariants}>
            <Link
              href="/terms"
              className="text-gray-600 hover:text-white transition-colors duration-300"
            >
              Terms of Service
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>
    </footer>
  );
}
