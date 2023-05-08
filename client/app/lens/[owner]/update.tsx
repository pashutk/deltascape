"use client";

import { useState } from "react";

type Props = {
  short: string;
  full: string;
};

export default function Update({ short, full }: Props) {
  const [updateMode, setUpdateMode] = useState<"short" | "full">("short");

  return (
    <>
      <h2 className="text-center text-4xl font-extrabold dark:text-white mb-4">
        Last week update
      </h2>
      {updateMode === "short" && (
        <p className="text-center text-gray-500 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
          {short}{" "}
          <span
            onClick={() => setUpdateMode("full")}
            className="inline-flex items-center font-medium text-blue-600 dark:text-blue-500 hover:underline"
          >
            Expand full update
            <svg
              aria-hidden="true"
              className="w-5 h-5 ml-1"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              ></path>
            </svg>
          </span>
        </p>
      )}

      {updateMode === "full" && (
        <p className="text-center text-gray-500 dark:text-gray-400 mb-8 whitespace-pre-wrap max-w-2xl mx-auto">
          {full}{" "}
          <span
            onClick={() => setUpdateMode("short")}
            className="inline-flex items-center font-medium text-blue-600 dark:text-blue-500 hover:underline"
          >
            Collapse back
            <svg
              aria-hidden="true"
              className="w-5 h-5 ml-1"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              ></path>
            </svg>
          </span>
        </p>
      )}
    </>
  );
}
