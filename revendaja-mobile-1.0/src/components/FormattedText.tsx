import React from 'react';
import { Text } from 'react-native';

type Props = {
  children: string;
  className?: string;
};

// Renderiza o texto da IA, que vem com **negrito** em markdown. Só esse trecho é interpretado
// (o resto é texto puro). Um `**` sem par fica como veio, em vez de sumir.
export default function FormattedText({ children, className }: Props) {
  const parts = children.split(/\*\*(.+?)\*\*/gs);
  // split com grupo de captura alterna: [texto, negrito, texto, negrito, ...]
  return (
    <Text className={className}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Text key={index} className="font-bold">
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}
