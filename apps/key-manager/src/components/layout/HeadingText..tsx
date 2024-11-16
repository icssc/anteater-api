import React from "react";

interface Props {
  children: React.ReactNode;
}

const HeadingText: React.FC<Props> = ({ children }) => {
  return (
    <div className={"space-y-2"}>
      <h1 className={"text-3xl"}>{children}</h1>
      <hr />
    </div>
  );
};


export default HeadingText;